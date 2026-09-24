'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/admin';
import { LEAD_STATUSES } from '@/lib/admin/status';
import { membershipDepositEmail, sendEmail } from '@/lib/email';
import { newDepositToken, depositLink } from '@/lib/membership';
import type { ActionResult } from '@/components/admin/action-form';

/** Move a Gir Gold Club enquiry along: new, contacted, converted, declined. */
export async function updateLeadStatus(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, message: 'You are no longer signed in as an admin.' };
  }

  const parsed = z
    .object({ leadId: z.string().uuid(), status: z.enum(LEAD_STATUSES) })
    .safeParse({ leadId: formData.get('leadId'), status: formData.get('status') });
  if (!parsed.success) return { ok: false, message: 'That update was not valid.' };

  const lead = await prisma.lead.update({
    where: { id: parsed.data.leadId },
    data: { status: parsed.data.status },
    select: { fullName: true },
  });

  revalidatePath('/admin/membership');
  return { ok: true, message: `${lead.fullName} marked ${parsed.data.status}.` };
}

/**
 * Confirm a seat: create the membership and email the deposit link.
 *
 * Everything that must be true together is done in one transaction - the
 * customer row, the membership, the seat number and the lead's new status. A
 * seat handed out but not recorded, or a lead marked converted with no
 * membership behind it, is the kind of half-state nobody notices until a
 * family turns up expecting a seat that does not exist.
 *
 * The email is sent after the transaction commits. Mail is a notification,
 * not part of the decision, and a mail outage must not roll back a confirmed
 * seat - the link can always be sent again.
 */
export async function approveMembership(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, message: 'You are no longer signed in as an admin.' };
  }

  const parsed = z
    .object({ leadId: z.string().uuid() })
    .safeParse({ leadId: formData.get('leadId') });
  if (!parsed.success) return { ok: false, message: 'That request was not valid.' };

  const lead = await prisma.lead.findUnique({ where: { id: parsed.data.leadId } });
  if (!lead) return { ok: false, message: 'That enquiry no longer exists.' };

  const email = lead.email.toLowerCase();
  const token = newDepositToken();

  let seatNumber: number;
  try {
    seatNumber = await prisma.$transaction(async (tx) => {
      /**
       * A customer row must exist to hang the membership on, but the family
       * may never have signed in - so this is created without an auth user
       * and picked up by syncCustomer if they sign in later with the same
       * address.
       */
      let customer = await tx.customer.findFirst({ where: { email } });
      if (!customer) {
        customer = await tx.customer.create({
          data: { id: crypto.randomUUID(), email, fullName: lead.fullName },
        });
      }

      const existing = await tx.membership.findUnique({ where: { customerId: customer.id } });
      if (existing) throw new Error('ALREADY_MEMBER');

      // Lowest unused seat, so numbers stay contiguous as families leave.
      const taken = await tx.membership.findMany({ select: { seatNumber: true } });
      const used = new Set(taken.map((m) => m.seatNumber));
      let seat = 1;
      while (used.has(seat)) seat += 1;
      if (seat > 250) throw new Error('CLUB_FULL');

      await tx.membership.create({
        data: {
          customerId: customer.id,
          seatNumber: seat,
          status: 'PENDING',
          depositStatus: 'UNPAID',
          depositToken: token,
          depositTokenAt: new Date(),
        },
      });

      await tx.lead.update({ where: { id: lead.id }, data: { status: 'converted' } });
      return seat;
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : '';
    if (code === 'ALREADY_MEMBER') {
      return { ok: false, message: `${lead.fullName} already holds a seat.` };
    }
    if (code === 'CLUB_FULL') {
      return { ok: false, message: 'All 250 seats are taken. No seat was created.' };
    }
    throw err;
  }

  const sent = await sendEmail(
    membershipDepositEmail({
      to: email,
      fullName: lead.fullName,
      seatNumber,
      depositPaise: 500000,
      link: depositLink(token),
    }),
  );

  revalidatePath('/admin/membership');
  return {
    ok: true,
    message: sent.delivered
      ? `Seat ${seatNumber} confirmed. Deposit link emailed to ${email}.`
      : `Seat ${seatNumber} confirmed, but the email did not send (${sent.reason ?? 'unknown'}). The link can be resent.`,
  };
}
