import 'server-only';
import { prisma } from '@/lib/prisma';
import { membershipActiveEmail, sendEmail } from '@/lib/email';
import type { ConfirmResult, ConfirmSource } from './confirm';

/**
 * Settles a founding deposit once the gateway has really taken it.
 *
 * The deposit used to be "recorded" by a button that charged nothing, so
 * anyone holding a deposit link could activate their membership - and the
 * 25% member rate - for free. Now a membership becomes ACTIVE only here, and
 * this runs only after a Razorpay signature has been verified: the browser's
 * checkout signature, or the webhook's.
 *
 * Both of those may arrive for the same payment, in either order. The update
 * is conditional on the deposit not being PAID yet, so exactly one of them
 * claims it and sends the welcome email; the other finds it done.
 */
export async function confirmPaidDeposit(params: {
  gatewayOrderId: string;
  gatewayPaymentId: string;
  amountPaise?: number;
  source: ConfirmSource;
}): Promise<ConfirmResult> {
  const membership = await prisma.membership.findUnique({
    where: { depositGatewayOrderId: params.gatewayOrderId },
    select: {
      id: true,
      seatNumber: true,
      depositPaise: true,
      customer: { select: { email: true, fullName: true } },
    },
  });

  if (!membership) {
    console.error(
      `[deposit:${params.source}] no membership for gateway order ${params.gatewayOrderId}`,
    );
    return { ok: false, first: false, reason: 'No such deposit' };
  }

  if (params.amountPaise !== undefined && params.amountPaise !== membership.depositPaise) {
    console.error(
      `[deposit:${params.source}] amount mismatch on seat ${membership.seatNumber}: ` +
        `gateway says ${params.amountPaise}, deposit is ${membership.depositPaise}`,
    );
    return { ok: false, first: false, reason: 'Amount mismatch' };
  }

  // A seat released while the customer sat on the payment screen still took
  // their money, so the payment is recorded - but the membership is NOT
  // activated without a seat, and it is flagged loudly for a refund or a
  // fresh seat.
  const hasSeat = membership.seatNumber !== null;

  const now = new Date();
  const claimed = await prisma.membership.updateMany({
    where: { id: membership.id, depositStatus: { not: 'PAID' } },
    data: {
      ...(hasSeat ? { status: 'ACTIVE' as const, joinedOn: now } : {}),
      depositStatus: 'PAID',
      depositPaidAt: now,
      depositPaymentId: params.gatewayPaymentId,
      // The link has done its job; a forwarded email must not reopen it.
      depositToken: null,
    },
  });

  if (claimed.count === 0) {
    return { ok: true, first: false };
  }

  if (!hasSeat || membership.seatNumber === null) {
    console.error(
      `[deposit:${params.source}] deposit ${params.gatewayPaymentId} paid for a released seat - needs a refund or a new seat`,
    );
    return { ok: true, first: true };
  }

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
      console.error(
        `[deposit] welcome email failed for seat ${membership.seatNumber}: ${sent.reason}`,
      );
    }
  }

  return { ok: true, first: true };
}

/** Whether a gateway order belongs to a deposit rather than a shop order. */
export async function isDepositGatewayOrder(gatewayOrderId: string): Promise<boolean> {
  const found = await prisma.membership.findUnique({
    where: { depositGatewayOrderId: gatewayOrderId },
    select: { id: true },
  });
  return found !== null;
}
