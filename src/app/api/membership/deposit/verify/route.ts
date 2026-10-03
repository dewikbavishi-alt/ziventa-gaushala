import { NextResponse } from 'next/server';
import { z } from 'zod';
import { confirmPaidDeposit } from '@/lib/payments/deposit';
import { razorpayConfigured, verifyCheckoutSignature } from '@/lib/payments/razorpay';

export const dynamic = 'force-dynamic';

/**
 * The browser's report that a deposit was paid, believed only on Razorpay's
 * signature - the same check as a shop order (../../payments/verify).
 *
 * The webhook settles the deposit too, for the customer who pays and closes
 * the tab before this call is made; confirmPaidDeposit lets whichever arrives
 * first win.
 */
const schema = z.object({
  razorpay_order_id: z.string().trim().min(6).max(64),
  razorpay_payment_id: z.string().trim().min(6).max(64),
  razorpay_signature: z.string().trim().min(16).max(256),
});

export async function POST(request: Request) {
  if (!razorpayConfigured()) {
    return NextResponse.json({ error: 'Payments are not configured.' }, { status: 503 });
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

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed.data;

  const genuine = verifyCheckoutSignature({
    razorpayOrderId: razorpay_order_id,
    razorpayPaymentId: razorpay_payment_id,
    signature: razorpay_signature,
  });

  if (!genuine) {
    console.error(`[deposit:browser] signature check FAILED for ${razorpay_order_id}`);
    return NextResponse.json({ error: 'We could not verify that payment.' }, { status: 400 });
  }

  const result = await confirmPaidDeposit({
    gatewayOrderId: razorpay_order_id,
    gatewayPaymentId: razorpay_payment_id,
    source: 'browser',
  });

  if (!result.ok) {
    return NextResponse.json({ error: 'We could not verify that payment.' }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
