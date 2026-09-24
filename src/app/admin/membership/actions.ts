'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/admin';
import { LEAD_STATUSES } from '@/lib/admin/status';
import { membershipDepositEmail, sendEmail } from '@/lib/email';
import { newDepositToken, depositLink, lowestFreeSeat, DEPOSIT_PAISE, SEATS } from '@/lib/membership';
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

  let outcome: { seat: number; owesDeposit: boolean; returning: boolean };
  try {
    outcome = await prisma.$transaction(async (tx) => {
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

      /**
       * One membership row per family, for their whole history with us.
       *
       * A family still holding a seat cannot be given a second one. A family
       * who left can come back, and then this row is reopened with a new seat
       * rather than a second row being created beside it - customerId is
       * unique, and their past should stay attached to them.
       */
      const existing = await tx.membership.findUnique({ where: { customerId: customer.id } });
      if (existing && existing.seatNumber !== null) throw new Error('ALREADY_MEMBER');

      const seat = await lowestFreeSeat(tx);

      if (existing) {
        /**
         * Returning family. If their deposit was refunded when they left they
         * pay it again, so they go back to PENDING with a fresh link. If it
         * was never refunded it still stands, and charging it twice would be
         * theft - so their seat is simply active again.
         */
        const owesDeposit = existing.depositStatus !== 'PAID';
        await tx.membership.update({
          where: { id: existing.id },
          data: {
            seatNumber: seat,
            status: owesDeposit ? 'PENDING' : 'ACTIVE',
            leftOn: null,
            ...(owesDeposit
              ? { depositStatus: 'UNPAID', depositToken: token, depositTokenAt: new Date() }
              : { joinedOn: existing.joinedOn ?? new Date() }),
          },
        });
        await tx.lead.update({ where: { id: lead.id }, data: { status: 'converted' } });
        return { seat, owesDeposit, returning: true };
      }

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
      return { seat, owesDeposit: true, returning: false };
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : '';
    if (code === 'ALREADY_MEMBER') {
      return { ok: false, message: `${lead.fullName} already holds a seat.` };
    }
    if (code === 'CLUB_FULL') {
      return {
        ok: false,
        message: `All ${SEATS} seats are taken. No seat was created - release one first if a family has left.`,
      };
    }
    throw err;
  }

  const { seat, owesDeposit, returning } = outcome;

  /**
   * A returning family whose deposit still stands has nothing to pay, so there
   * is no link to send. Emailing them a deposit request would ask for money we
   * are already holding.
   */
  if (!owesDeposit) {
    revalidatePath('/admin/membership', 'layout');
    return {
      ok: true,
      message: `${lead.fullName} is back on seat ${seat}. Their deposit was never refunded, so nothing is owed and the seat is active.`,
    };
  }

  const sent = await sendEmail(
    membershipDepositEmail({
      to: email,
      fullName: lead.fullName,
      seatNumber: seat,
      depositPaise: DEPOSIT_PAISE,
      link: depositLink(token),
    }),
  );

  revalidatePath('/admin/membership', 'layout');
  const who = returning ? `${lead.fullName} is back on seat ${seat}` : `Seat ${seat} confirmed`;
  return {
    ok: true,
    message: sent.delivered
      ? `${who}. Deposit link emailed to ${email}.`
      : `${who}, but the email did not send (${sent.reason ?? 'unknown'}). The link can be resent.`,
  };
}

/**
 * A family leaves the club, and their seat goes back to the 250.
 *
 * This is the counterpart to approveMembership. Discontinuing, not renewing
 * and being asked to leave all land here: the membership is marked LEFT, the
 * seat number is cleared so the next family can have it, and the number they
 * held is kept on the record.
 *
 * What it deliberately does NOT do is delete anything. They paid a deposit and
 * placed orders; that history stays, and if they come back approveMembership
 * reopens this same row.
 */
export async function releaseSeat(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, message: 'You are no longer signed in as an admin.' };
  }

  const parsed = z
    .object({
      membershipId: z.string().uuid(),
      reason: z.string().trim().max(300).optional(),
      /** An unchecked checkbox sends nothing at all, so absent means no. */
      refundDeposit: z.literal('on').optional(),
    })
    .safeParse({
      membershipId: formData.get('membershipId'),
      reason: formData.get('reason') ?? undefined,
      refundDeposit: formData.get('refundDeposit') ?? undefined,
    });
  if (!parsed.success) return { ok: false, message: 'That request was not valid.' };
  const { membershipId, reason } = parsed.data;
  const refunding = parsed.data.refundDeposit === 'on';

  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
    select: {
      seatNumber: true,
      depositStatus: true,
      notes: true,
      customer: { select: { fullName: true, email: true } },
    },
  });
  if (!membership) return { ok: false, message: 'That membership no longer exists.' };
  if (membership.seatNumber === null) {
    return { ok: false, message: 'That family has already left. Their seat is free.' };
  }

  const seat = membership.seatNumber;
  const family = membership.customer.fullName?.trim() || membership.customer.email || 'That family';

  /**
   * Refunding is only offered for a deposit that was actually paid. Marking an
   * unpaid deposit REFUNDED would say we returned money we never received.
   */
  const refundable = membership.depositStatus === 'PAID';
  const marksRefunded = refunding && refundable;

  const note = [
    membership.notes?.trim(),
    `Left the club on ${new Date().toISOString().slice(0, 10)}, seat ${seat} released.${
      reason ? ` Reason: ${reason}` : ''
    }${marksRefunded ? ' Deposit refunded.' : ''}`,
  ]
    .filter(Boolean)
    .join('\n');

  /**
   * updateMany with the seat in the WHERE clause, not update by id.
   *
   * Two admins releasing the same seat at once would otherwise both succeed,
   * and the second would overwrite the first's record of why. Here the second
   * matches nothing and is told to reload. It is the same optimistic
   * concurrency the order actions use.
   */
  const released = await prisma.membership.updateMany({
    where: { id: membershipId, seatNumber: seat },
    data: {
      seatNumber: null,
      formerSeatNumber: seat,
      status: 'LEFT',
      leftOn: new Date(),
      // The deposit link dies with the membership. Leaving it live would let a
      // departed family settle a deposit for a seat they no longer hold.
      depositToken: null,
      ...(marksRefunded ? { depositStatus: 'REFUNDED' } : {}),
      notes: note,
    },
  });

  if (released.count === 0) {
    return { ok: false, message: 'Someone else changed this membership a moment ago. Reload to see it.' };
  }

  revalidatePath('/admin/membership', 'layout');
  revalidatePath('/your-account/membership');

  const refundNote = marksRefunded
    ? ' Deposit marked refunded.'
    : refunding && !refundable
      ? ' Their deposit was never paid, so nothing was marked refunded.'
      : '';
  return {
    ok: true,
    message: `${family} has left the club. Seat ${seat} is free again.${refundNote}`,
  };
}
