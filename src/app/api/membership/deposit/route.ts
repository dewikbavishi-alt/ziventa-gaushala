import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { membershipActiveEmail, sendEmail } from '@/lib/email';

/**
 * Records the founding deposit and activates the seat.
 *
 * There is no payment provider yet, so nothing is charged - exactly as at
 * checkout, and the page says so. When one is connected, this is where its
 * webhook or verification result goes, and the rest of the flow is unchanged.
 *
 * The amount is never taken from the request. It is read from the membership
 * the token identifies, so the page cannot be edited to settle a seat for a
 * rupee.
 */
export const dynamic = 'force-dynamic';

const schema = z.object({
  token: z.string().min(32).max(128),
  method: z.enum(['UPI', 'Card', 'Net Banking']),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    // Cash on delivery reaches here if someone posts it by hand. There is no
    // delivery to attach a deposit to, so it is not an accepted method.
    return NextResponse.json({ error: 'That payment method is not accepted.' }, { status: 422 });
  }

  const membership = await prisma.membership.findUnique({
    where: { depositToken: parsed.data.token },
    select: {
      id: true,
      seatNumber: true,
      depositStatus: true,
      customer: { select: { email: true, fullName: true } },
    },
  });

  if (!membership) {
    return NextResponse.json({ error: 'This link is no longer active.' }, { status: 404 });
  }

  if (membership.depositStatus === 'PAID') {
    // Someone pressed pay twice, or reopened the page from the email. Not an
    // error worth showing - the seat is settled either way.
    return NextResponse.json({ ok: true, alreadyPaid: true, seatNumber: membership.seatNumber });
  }

  /**
   * Activating and clearing the token happen together.
   *
   * The token is what makes the link work, so clearing it in the same write
   * that marks the deposit paid is what stops a forwarded email being replayed
   * later against a seat that has already settled.
   */
  await prisma.membership.update({
    where: { id: membership.id },
    data: {
      status: 'ACTIVE',
      depositStatus: 'PAID',
      depositPaidAt: new Date(),
      depositToken: null,
      joinedOn: new Date(),
      notes: `Deposit recorded via ${parsed.data.method} (demonstration payment).`,
    },
  });

  /**
   * Sent after the membership is committed. The seat is active whether or not
   * the email lands; a mail outage must not cost someone the thing they just
   * paid for.
   */
  const email = membership.customer.email;
  if (email) {
    const sent = await sendEmail(
      membershipActiveEmail({
        to: email,
        fullName: membership.customer.fullName?.trim() || 'there',
        seatNumber: membership.seatNumber,
      }),
    );
    if (!sent.delivered) {
      console.error(`[membership] welcome email failed for seat ${membership.seatNumber}: ${sent.reason}`);
    }
  }

  return NextResponse.json({ ok: true, seatNumber: membership.seatNumber });
}
