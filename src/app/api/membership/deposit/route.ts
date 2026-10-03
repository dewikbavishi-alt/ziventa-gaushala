import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { DEPOSIT_PAISE } from '@/lib/membership';
import {
  PaymentError,
  createRazorpayOrder,
  razorpayConfigured,
  razorpayIsLive,
  razorpayKeyId,
} from '@/lib/payments/razorpay';

export const dynamic = 'force-dynamic';

/**
 * Starts a deposit payment: creates a Razorpay order for the deposit and
 * hands the browser what it needs to open Checkout.
 *
 * This route does NOT mark anything paid. It used to - a button here
 * "recorded" the deposit without charging a rupee, which let anyone holding a
 * deposit link activate their membership and the 25% member rate for free.
 * The membership now activates only in confirmPaidDeposit, after a verified
 * Razorpay signature (see ./verify and the payments webhook).
 */
const schema = z.object({
  token: z.string().min(32).max(128),
});

export async function POST(request: Request) {
  if (!razorpayConfigured()) {
    return NextResponse.json(
      {
        error:
          'Online payment is not available just yet. Reply to the email we sent you and we will arrange the deposit with you directly.',
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const membership = await prisma.membership.findUnique({
    where: { depositToken: parsed.data.token },
    select: {
      id: true,
      seatNumber: true,
      depositPaise: true,
      depositStatus: true,
      customer: { select: { email: true, fullName: true, phone: true } },
    },
  });

  if (!membership) {
    return NextResponse.json({ error: 'This link is no longer active.' }, { status: 404 });
  }
  if (membership.seatNumber === null) {
    return NextResponse.json({ error: 'This membership has ended.' }, { status: 409 });
  }
  if (membership.depositStatus === 'PAID') {
    return NextResponse.json({ ok: true, alreadyPaid: true, seatNumber: membership.seatNumber });
  }

  const amountPaise = membership.depositPaise || DEPOSIT_PAISE;

  try {
    // A fresh gateway order each time Checkout opens. Saving it replaces any
    // earlier one, so a payment can only ever settle against the latest.
    const gatewayOrder = await createRazorpayOrder({
      amountPaise,
      receipt: `DEP-seat-${membership.seatNumber}`,
      notes: { kind: 'deposit', seat: String(membership.seatNumber) },
    });

    await prisma.membership.update({
      where: { id: membership.id },
      data: { depositGatewayOrderId: gatewayOrder.id },
    });

    return NextResponse.json({
      ok: true,
      payment: {
        orderId: gatewayOrder.id,
        keyId: razorpayKeyId(),
        amountPaise,
        live: razorpayIsLive(),
        seatNumber: membership.seatNumber,
        prefill: {
          name: membership.customer.fullName ?? '',
          email: membership.customer.email ?? '',
          contact: membership.customer.phone ?? '',
        },
      },
    });
  } catch (err) {
    const message =
      err instanceof PaymentError ? err.message : 'We could not start the payment.';
    console.error(`[deposit] gateway order failed for seat ${membership.seatNumber}: ${(err as Error).message}`);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
