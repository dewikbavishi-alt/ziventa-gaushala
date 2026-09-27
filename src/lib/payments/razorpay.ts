import crypto from 'node:crypto';

/**
 * Razorpay, over its REST API.
 *
 * No SDK. The three calls this site needs are one POST and two HMACs, and a
 * dependency that signs payment requests is a dependency worth not having -
 * everything security-critical here is visible in this file.
 *
 * Nothing in this module trusts the browser. The amount is passed in by the
 * caller, which reads it from priceCart, and every value coming back from a
 * customer's browser is checked against a signature before it is believed.
 */

const API = 'https://api.razorpay.com/v1';

/** Live keys start rzp_live_, test keys rzp_test_. */
export function razorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID?.trim() && process.env.RAZORPAY_KEY_SECRET?.trim());
}

/**
 * Whether this is real money.
 *
 * Worth knowing separately from "configured", because the checkout says so to
 * the customer and the admin dashboard should not report test payments as
 * takings.
 */
export function razorpayIsLive(): boolean {
  return (process.env.RAZORPAY_KEY_ID ?? '').trim().startsWith('rzp_live_');
}

/** The publishable half. Safe in the browser - it is in the widget anyway. */
export function razorpayKeyId(): string {
  return (process.env.RAZORPAY_KEY_ID ?? '').trim();
}

function keySecret(): string {
  const s = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!s) throw new Error('RAZORPAY_KEY_SECRET is not set');
  return s;
}

export class PaymentError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

/**
 * Register the amount with Razorpay before the customer can pay it.
 *
 * This is what makes the price un-tamperable end to end: the browser opens
 * the widget with an order id, not an amount, so the figure the customer is
 * asked for is the one recorded here from priceCart. A browser that edits
 * anything can only ever pay for a different, already-priced order.
 *
 * `receipt` is our own order number, which is how a payment found later in
 * Razorpay's dashboard is matched back to an order here.
 */
export async function createRazorpayOrder(params: {
  amountPaise: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  if (!Number.isInteger(params.amountPaise) || params.amountPaise < 100) {
    // Razorpay's own floor is Rs 1. A non-integer here would be a bug
    // upstream in pricing, and must never reach a payment request.
    throw new PaymentError('Invalid amount for payment', 500);
  }

  const auth = Buffer.from(`${razorpayKeyId()}:${keySecret()}`).toString('base64');

  let res: Response;
  try {
    res = await fetch(`${API}/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: params.amountPaise,
        currency: 'INR',
        receipt: params.receipt.slice(0, 40),
        // Razorpay only accepts string values here.
        notes: params.notes ?? {},
      }),
      // A hung payment provider must not hold a checkout request open.
      signal: AbortSignal.timeout(12_000),
    });
  } catch (err) {
    const why = err instanceof Error && err.name === 'TimeoutError' ? 'timed out' : 'was unreachable';
    throw new PaymentError(`The payment provider ${why}. Nothing has been charged.`);
  }

  const body = (await res.json().catch(() => null)) as
    | (RazorpayOrder & { error?: { description?: string } })
    | null;

  if (!res.ok || !body?.id) {
    // Razorpay's own wording can name internal fields; it is logged, not shown.
    console.error(
      `[razorpay] order create failed: ${res.status} ${body?.error?.description ?? '(no description)'}`,
    );
    throw new PaymentError('We could not start the payment. Nothing has been charged.');
  }

  return body;
}

/**
 * Constant-time compare that cannot throw on a length mismatch.
 *
 * timingSafeEqual requires equal lengths and raises otherwise, which would
 * both crash the route and leak the length of the expected value through the
 * difference between an exception and a false.
 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Did this browser really just pay for this order?
 *
 * Razorpay hands the browser three values on success and the browser hands
 * them to us. They are worth exactly nothing on their own - anyone can POST
 * a payment id - so the signature is the whole proof: an HMAC of
 * "<order_id>|<payment_id>" under the key secret, which only Razorpay and
 * this server know.
 */
export function verifyCheckoutSignature(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature: string;
}): boolean {
  const expected = crypto
    .createHmac('sha256', keySecret())
    .update(`${params.razorpayOrderId}|${params.razorpayPaymentId}`)
    .digest('hex');
  return safeEqual(expected, params.signature);
}

/**
 * Did this webhook really come from Razorpay?
 *
 * Signed over the RAW request body. Parsing and re-serialising the JSON first
 * changes the bytes - key order, spacing, unicode escapes - and the signature
 * then never matches, which is the single most common way this is got wrong.
 *
 * A separate secret from the API key: it is set when the webhook is created
 * in the dashboard, and rotating one must not silently break the other.
 */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqual(expected, signature);
}
