import { NextResponse } from 'next/server';
import { confirmPaidOrder, releaseAbandonedOrder } from '@/lib/payments/confirm';
import { confirmPaidDeposit, isDepositGatewayOrder } from '@/lib/payments/deposit';
import { verifyWebhookSignature } from '@/lib/payments/razorpay';

/**
 * Razorpay tells us what happened. This is the authoritative record.
 *
 * The browser callback in ../verify is a courtesy for the customer who stayed
 * on the page. This is the one that has to be right, because a payment is
 * real whether or not anyone's browser survived to report it - closed tab,
 * dead battery, a bank's 3-D Secure page that never came back. Razorpay
 * retries this until it gets a 2xx, which is why the handler is written to be
 * safely repeatable rather than to run once.
 *
 * Set up in the Razorpay dashboard against:
 *   https://girbyziventa.com/api/payments/webhook
 * subscribing to payment.captured and payment.failed, with the secret in
 * RAZORPAY_WEBHOOK_SECRET.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  /**
   * The RAW body, before anything parses it.
   *
   * The signature is computed over these exact bytes. Reading JSON first and
   * re-serialising it changes key order, spacing and unicode escaping, and
   * the signature then never matches - the single most common way a webhook
   * integration is got wrong, and it fails closed, so every payment silently
   * stops being recorded.
   */
  const raw = await request.text();
  const signature = request.headers.get('x-razorpay-signature') ?? '';

  if (!verifyWebhookSignature(raw, signature)) {
    /**
     * Not from Razorpay, or the secret is wrong. 400 rather than 500: a retry
     * would fail identically, and there is nothing here worth retrying.
     *
     * Worth checking RAZORPAY_WEBHOOK_SECRET first if this appears after a
     * deploy - a missing secret makes every genuine message look forged.
     */
    console.error('[payment:webhook] signature check FAILED - message ignored');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: {
    event?: string;
    payload?: { payment?: { entity?: { id?: string; order_id?: string; amount?: number } } };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const payment = event.payload?.payment?.entity;
  const name = event.event ?? '(none)';

  // Signed, but not about a payment we can act on. Acknowledged so Razorpay
  // stops retrying something we will never do anything with.
  if (!payment?.id || !payment.order_id) {
    console.log(`[payment:webhook] ${name}: nothing to act on`);
    return NextResponse.json({ ok: true, ignored: name });
  }

  try {
    // Membership deposits share the gateway, and the webhook, with shop
    // orders; which one a payment is for is decided by whose gateway order
    // id it carries.
    if (await isDepositGatewayOrder(payment.order_id)) {
      if (name === 'payment.captured' || name === 'order.paid') {
        const result = await confirmPaidDeposit({
          gatewayOrderId: payment.order_id,
          gatewayPaymentId: payment.id,
          amountPaise: payment.amount,
          source: 'webhook',
        });
        if (!result.ok) return NextResponse.json({ ok: true, refused: result.reason });
        console.log(
          `[payment:webhook] deposit ${payment.order_id} paid` +
            (result.first ? '' : ' (already recorded by the browser)'),
        );
        return NextResponse.json({ ok: true });
      }
      // A failed deposit attempt holds nothing back - no stock, no seat - so
      // there is nothing to release. The link still works for another try.
      console.log(`[payment:webhook] deposit ${payment.order_id}: ${name}`);
      return NextResponse.json({ ok: true });
    }

    if (name === 'payment.captured' || name === 'order.paid') {
      const result = await confirmPaidOrder({
        gatewayOrderId: payment.order_id,
        gatewayPaymentId: payment.id,
        amountPaise: payment.amount,
        source: 'webhook',
      });

      if (!result.ok) {
        /**
         * Refused for a reason that will not change on a retry - no such
         * order, or an amount that does not match what was priced. Answered
         * 200 so Razorpay stops resending it; the error is already logged
         * loudly by confirmPaidOrder, and this needs a person, not a retry.
         */
        return NextResponse.json({ ok: true, refused: result.reason });
      }

      console.log(
        `[payment:webhook] ${result.orderNumber} paid` +
          (result.first ? '' : ' (already recorded by the browser)'),
      );
      return NextResponse.json({ ok: true });
    }

    if (name === 'payment.failed') {
      // Puts the units back. Safe to receive more than once.
      await releaseAbandonedOrder(payment.order_id);
      return NextResponse.json({ ok: true });
    }

    console.log(`[payment:webhook] ${name}: not handled`);
    return NextResponse.json({ ok: true, ignored: name });
  } catch (err) {
    /**
     * Something genuinely went wrong on our side - the database was
     * unreachable, most likely. 500 so Razorpay retries, because the
     * alternative is a paid order that this site never records.
     */
    console.error(`[payment:webhook] ${name} failed: ${(err as Error).message}`);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
