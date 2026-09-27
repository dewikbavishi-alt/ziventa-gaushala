import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import {
  CartError,
  generateOrderNumber,
  memberRateApplies,
  priceCart,
  reserveStock,
} from '@/lib/orders';
import { getCurrentUser } from '@/lib/supabase/server';
import { syncCustomer } from '@/lib/auth';
import { releaseAbandonedOrder, sendOrderEmails } from '@/lib/payments/confirm';
import {
  PaymentError,
  createRazorpayOrder,
  razorpayConfigured,
  razorpayIsLive,
  razorpayKeyId,
} from '@/lib/payments/razorpay';

const orderSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(200),
    phone: z.string().trim().min(6).max(30),
  }),
  address: z.object({
    line1: z.string().trim().min(3).max(200),
    line2: z.string().trim().max(200).optional().or(z.literal('')),
    city: z.string().trim().min(2).max(120),
    // Required. GST and courier rate cards both key on the state, and the
    // first four orders were saved without one - which is why this is now
    // enforced here and not only in the browser.
    state: z.string().trim().min(2, 'Please select your state').max(120),
    postcode: z
      .string()
      .trim()
      .regex(/^\d{6}$/, 'Enter a 6-digit PIN code'),
    country: z.string().trim().length(2).default('IN'),
  }),
  /** Only ids and quantities. Deliberately no price field to tamper with. */
  items: z
    .array(
      z.object({
        slug: z.string().trim().min(1).max(120),
        quantity: z.number().int().min(1).max(50),
      }),
    )
    .min(1, 'Your cart is empty')
    .max(40),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
  /**
   * How they intend to pay. Absent means the older checkout that predates the
   * gateway, which is treated as cash on delivery - so a browser holding a
   * cached copy of the page keeps working rather than failing at the last
   * step. It selects a ROUTE, never a price.
   */
  payment: z.enum(['online', 'cod']).optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const parsed = orderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Please check your details',
        issues: parsed.error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      },
      { status: 422 },
    );
  }
  const input = parsed.data;

  /**
   * Who is ordering, if they happen to be signed in.
   *
   * Guest checkout still works - customerId is simply left null and the order
   * is not attached to an account.
   */
  let customerId: string | null = null;
  const user = await getCurrentUser();
  if (user) {
    await syncCustomer(user);
    customerId = user.id;
  }
  /**
   * Whether the member rate applies is read from the session, never from the
   * request. The body has no field for it, exactly as it has no field for a
   * price - both would be free money to anyone with dev tools open.
   */
  const isMember = await memberRateApplies(customerId);

  // Prices always come from the database, never from the request.
  let cart;
  try {
    cart = await priceCart(input.items, { isMember });
  } catch (err) {
    if (err instanceof CartError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const contactEmail = input.customer.email.toLowerCase();

  /**
   * Whether this order goes through the gateway.
   *
   * Both halves have to be true. Asking to pay online when no keys are
   * configured falls back to the old behaviour rather than failing, which is
   * what keeps this whole change inert until Razorpay is actually set up -
   * the site behaves exactly as it did before, and starts taking payments the
   * moment the keys exist, with no second deploy.
   */
  const payingOnline = input.payment === 'online' && razorpayConfigured();

  /**
   * Taking the stock and recording the sale happen together, or not at all.
   *
   * Three things have to agree: this is not a replayed submission, the units
   * are actually available, and the order is written down. Done as three
   * separate statements, a failure between them leaves the shop lying - stock
   * gone with no order to show for it, or an order promising jars that were
   * never claimed. Inside one transaction there is no such in-between state.
   *
   * The duplicate check moved in here for the same reason: two copies of one
   * submission arriving together used to be able to pass the check side by
   * side and both go on to reserve stock.
   */
  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      /**
       * Same customer, same total, within two minutes - almost certainly one
       * order sent twice rather than two orders.
       *
       * The checkout button disables on click, but a retry after a dropped
       * connection or a replayed request still arrives as a second POST, and
       * the cost of getting this wrong is a family charged and delivered
       * twice. Matching on total as well as email keeps a genuine second,
       * different order from being swallowed. Two minutes is short enough that
       * reordering the same thing deliberately still works.
       */
      const duplicate = await tx.order.findFirst({
        where: {
          contactEmail,
          totalPaise: cart.totalPaise,
          placedAt: { gte: new Date(Date.now() - 2 * 60 * 1000) },
        },
        orderBy: { placedAt: 'desc' },
        select: { orderNumber: true, totalPaise: true },
      });

      if (duplicate) {
        // Returns before reserving anything, so a resend never takes stock a
        // second time for the same order.
        return { kind: 'duplicate' as const, duplicate };
      }

      // Throws a CartError if anything sold out in the meantime, which rolls
      // this whole transaction back and records no order.
      await reserveStock(tx, cart.tracked);

      const order = await tx.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          customerId,
          contactName: input.customer.name,
          contactEmail,
          contactPhone: input.customer.phone,
          shipLine1: input.address.line1,
          shipLine2: input.address.line2 || null,
          shipCity: input.address.city,
          shipState: input.address.state,
          shipPostcode: input.address.postcode,
          shipCountry: input.address.country,
          subtotalPaise: cart.subtotalPaise,
          shippingPaise: cart.shippingPaise,
          totalPaise: cart.totalPaise,
          notes: input.notes || null,
          // Stamped in the same write as the decrement above, so this can
          // never claim a reservation that did not happen. Cancelling the
          // order later reads this to decide whether to give the units back.
          stockReservedAt: new Date(),
          paymentProvider: payingOnline ? 'razorpay' : 'cod',
          items: { create: cart.items },
        },
        include: { items: true },
      });

      return { kind: 'created' as const, order };
    });
  } catch (err) {
    if (err instanceof CartError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  if (result.kind === 'duplicate') {
    return NextResponse.json(
      {
        ok: true,
        orderNumber: result.duplicate.orderNumber,
        amountPaise: result.duplicate.totalPaise,
        duplicate: true,
        // Not recorded for the original order, so this branch cannot know.
        // Saying false is honest; saying true would promise an email that may
        // never have been sent.
        confirmationSent: false,
        payment: { provider: 'none' },
      },
      { status: 200 },
    );
  }

  const { order } = result;

  /**
   * Paying online: register the amount with Razorpay and hand the browser an
   * order id to open the widget with.
   *
   * The browser never receives an amount to pass on. It gets an id for a sum
   * already fixed here from priceCart, so the figure the customer is asked
   * for cannot be edited into something else on the way.
   */
  if (payingOnline) {
    try {
      const gatewayOrder = await createRazorpayOrder({
        amountPaise: order.totalPaise,
        receipt: order.orderNumber,
        notes: { orderNumber: order.orderNumber, customer: order.contactName.slice(0, 60) },
      });

      await prisma.order.update({
        where: { id: order.id },
        data: { paymentReference: gatewayOrder.id },
      });

      /**
       * No email yet. Nothing has been paid, and "thank you for your order"
       * before the money moves is a message half these customers should
       * never receive - the ones who close the widget. Both emails are sent
       * by confirmPaidOrder once payment actually lands.
       */
      return NextResponse.json(
        {
          ok: true,
          orderNumber: order.orderNumber,
          amountPaise: order.totalPaise,
          confirmationSent: false,
          memberRate: cart.isMember,
          savedPaise: cart.savedPaise,
          payment: {
            provider: 'razorpay',
            orderId: gatewayOrder.id,
            // Publishable half of the key pair; it is in the widget anyway.
            keyId: razorpayKeyId(),
            amountPaise: order.totalPaise,
            live: razorpayIsLive(),
          },
        },
        { status: 201 },
      );
    } catch (err) {
      /**
       * The gateway refused or was unreachable. The order exists and is
       * holding stock, so the stock goes back rather than being held for a
       * checkout that can never complete.
       */
      await releaseAbandonedOrder(order.paymentReference ?? '').catch(() => {});
      await prisma.order
        .update({
          where: { id: order.id },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            paymentStatus: 'FAILED',
            cancelReason: 'Could not reach the payment provider.',
          },
        })
        .catch(() => {});

      const message =
        err instanceof PaymentError ? err.message : 'We could not start the payment.';
      console.error(`[order ${order.orderNumber}] gateway order failed: ${(err as Error).message}`);
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  /**
   * Cash on delivery, or no gateway configured. The order IS the commitment,
   * so it is confirmed now and both emails go immediately - which is exactly
   * what happened before the gateway existed.
   */
  await sendOrderEmails(order.id);

  return NextResponse.json(
    {
      ok: true,
      orderNumber: order.orderNumber,
      amountPaise: order.totalPaise,
      confirmationSent: true,
      // What the server actually charged at, so the receipt can say so rather
      // than guessing from whatever the browser believed.
      memberRate: cart.isMember,
      savedPaise: cart.savedPaise,
      payment: { provider: razorpayConfigured() ? 'cod' : 'none' },
    },
    { status: 201 },
  );
}
