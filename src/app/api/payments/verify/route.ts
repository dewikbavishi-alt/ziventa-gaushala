import { NextResponse } from 'next/server';
import { z } from 'zod';
import { confirmPaidOrder } from '@/lib/payments/confirm';
import { razorpayConfigured, verifyCheckoutSignature } from '@/lib/payments/razorpay';

/**
 * The browser says the payment succeeded. Check whether it is telling the
 * truth.
 *
 * Razorpay hands the customer's browser three values when a payment goes
 * through, and the browser posts them here. On their own they prove nothing -
 * anyone can send this request with any payment id they like. The signature
 * is the whole proof: an HMAC over "<order_id>|<payment_id>" keyed with the
 * secret only Razorpay and this server hold.
 *
 * This route is a convenience, not the record. The webhook is what makes a
 * payment real, because a browser can be closed the instant after the money
 * moves. This exists so the customer who DID stay sees their receipt straight
 * away rather than waiting on a webhook, and both paths go through the same
 * confirmPaidOrder, which makes the second one a no-op.
 */
export const dynamic = 'force-dynamic';

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
    /**
     * Someone posted a payment that Razorpay did not sign. Logged loudly,
     * because the only reasons to see this are a bug on our side or an
     * attempt to mark an order paid without paying - and both matter.
     *
     * The customer is told nothing specific. A message distinguishing "bad
     * signature" from "unknown order" is a tool for working out which ids
     * exist.
     */
    console.error(
      `[payment:browser] signature check FAILED for order ${razorpay_order_id}`,
    );
    return NextResponse.json({ error: 'We could not verify that payment.' }, { status: 400 });
  }

  const result = await confirmPaidOrder({
    gatewayOrderId: razorpay_order_id,
    gatewayPaymentId: razorpay_payment_id,
    source: 'browser',
  });

  if (!result.ok) {
    return NextResponse.json({ error: 'We could not verify that payment.' }, { status: 409 });
  }

  return NextResponse.json({ ok: true, orderNumber: result.orderNumber });
}
