import { prisma } from '@/lib/prisma';
import { businessOrderEmail, customerOrderEmail, sendEmail } from '@/lib/email';
import { restoreStock } from '@/lib/orders';

/**
 * An order has been paid for. Record it once, and tell everybody once.
 *
 * TWO things call this and both are expected to: the browser, when Razorpay
 * hands it a signed success, and Razorpay's webhook. Neither is sufficient
 * alone. The browser can be closed on the bank's 3-D Secure page a moment
 * after the money leaves, and the webhook can be delayed or retried for
 * minutes. So both run, usually within a second of each other, and the job of
 * this function is to make the second one a no-op.
 *
 * The guard is the write itself. updateMany with `paymentStatus: not PAID` in
 * the WHERE either matches one row or none, decided by Postgres while holding
 * it. Whoever matches sends the emails; whoever does not, returns quietly.
 * Reading first and then deciding in JavaScript is the version of this that
 * sends two confirmations and marks one order twice.
 */
export type ConfirmSource = 'browser' | 'webhook';

export interface ConfirmResult {
  ok: boolean;
  /** True when this call is the one that moved the order to PAID. */
  first: boolean;
  orderNumber?: string;
  reason?: string;
}

export async function confirmPaidOrder(params: {
  /** Razorpay's order id - what we matched the payment back to our order by. */
  gatewayOrderId: string;
  /** Razorpay's payment id. Recorded so a refund has something to aim at. */
  gatewayPaymentId: string;
  /** Paise, as the gateway reports them. Checked, never trusted. */
  amountPaise?: number;
  source: ConfirmSource;
}): Promise<ConfirmResult> {
  const order = await prisma.order.findUnique({
    where: { paymentReference: params.gatewayOrderId },
    select: { id: true, orderNumber: true, totalPaise: true, paymentStatus: true },
  });

  if (!order) {
    // A payment for something we have no record of. Never silently accepted:
    // it is either a gateway order we failed to save, or a message meant for
    // somebody else's account.
    console.error(
      `[payment:${params.source}] no order for gateway order ${params.gatewayOrderId}`,
    );
    return { ok: false, first: false, reason: 'No such order' };
  }

  /**
   * What arrived must be what was asked for.
   *
   * The amount was fixed when the gateway order was created from priceCart,
   * so a mismatch cannot be a customer choosing to pay less - it means the
   * gateway order and our order have come apart, and marking it paid would
   * record a sale at a price nobody agreed. Flagged rather than accepted.
   */
  if (params.amountPaise !== undefined && params.amountPaise !== order.totalPaise) {
    console.error(
      `[payment:${params.source}] amount mismatch on ${order.orderNumber}: ` +
        `gateway says ${params.amountPaise}, order says ${order.totalPaise}`,
    );
    return { ok: false, first: false, reason: 'Amount mismatch' };
  }

  const claimed = await prisma.order.updateMany({
    where: { id: order.id, paymentStatus: { not: 'PAID' } },
    data: {
      paymentStatus: 'PAID',
      paymentId: params.gatewayPaymentId,
      // Paid orders are confirmed orders. The shop no longer has to ring to
      // ask whether the family still wants it; it rings to arrange delivery.
      status: 'CONFIRMED',
      confirmedAt: new Date(),
    },
  });

  if (claimed.count === 0) {
    // The other of the two got here first. Not an error - the expected case.
    return { ok: true, first: false, orderNumber: order.orderNumber };
  }

  await sendOrderEmails(order.id);
  return { ok: true, first: true, orderNumber: order.orderNumber };
}

/**
 * The confirmation to the customer and the alert to the shop.
 *
 * Sent after the order is committed as paid, never before and never inside
 * the transaction. Mail is a notification, not part of the sale: an outage at
 * the mail server must not roll back money that has already moved, and must
 * not show the customer an error for something that worked.
 */
export async function sendOrderEmails(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) return;

  const data = {
    orderNumber: order.orderNumber,
    contactName: order.contactName,
    contactEmail: order.contactEmail,
    contactPhone: order.contactPhone,
    shipLine1: order.shipLine1,
    shipLine2: order.shipLine2,
    shipCity: order.shipCity,
    shipState: order.shipState,
    shipPostcode: order.shipPostcode,
    subtotalPaise: order.subtotalPaise,
    shippingPaise: order.shippingPaise,
    totalPaise: order.totalPaise,
    notes: order.notes,
    items: order.items.map((i) => ({
      productName: i.productName,
      unitPricePaise: i.unitPricePaise,
      quantity: i.quantity,
    })),
  };

  const [toCustomer, toBusiness] = await Promise.all([
    sendEmail(customerOrderEmail(data)),
    sendEmail(businessOrderEmail(data)),
  ]);

  if (!toCustomer.delivered) {
    console.warn(`[order ${order.orderNumber}] confirmation not sent: ${toCustomer.reason}`);
  }
  if (!toBusiness.delivered) {
    console.warn(`[order ${order.orderNumber}] alert not sent: ${toBusiness.reason}`);
  }
}

/**
 * The customer's payment failed, or they walked away from the widget.
 *
 * The units this order was holding go back on the shelf. Without this an
 * abandoned checkout keeps stock reserved until somebody notices, and the
 * shop reports itself sold out of something sitting in the store room.
 *
 * Only ever for an order that is not paid. The same stockReleasedAt guard the
 * membership seats use makes it safe to call more than once - a customer who
 * fails twice and retries must not return the units twice.
 */
export async function releaseAbandonedOrder(gatewayOrderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { paymentReference: gatewayOrderId },
    select: {
      id: true,
      orderNumber: true,
      paymentStatus: true,
      stockReservedAt: true,
      stockReleasedAt: true,
      items: { select: { productId: true, productName: true, quantity: true } },
    },
  });

  if (!order || order.paymentStatus === 'PAID') return;

  /**
   * Two separate jobs, and only one of them is conditional.
   *
   * The order is marked failed whether or not any stock was involved - an
   * abandoned checkout is an abandoned checkout. Giving units back is the
   * part that depends on having taken some, and on not having given them
   * back already.
   *
   * These were one condition to begin with, which meant an order that never
   * reserved anything was silently left sitting at PENDING forever, looking
   * to the admin like a customer still deciding.
   */
  const canRelease = Boolean(order.stockReservedAt) && !order.stockReleasedAt;

  await prisma.$transaction(async (tx) => {
    const marked = await tx.order.updateMany({
      where: {
        id: order.id,
        paymentStatus: { not: 'PAID' },
        // Only when releasing, so two failures arriving together cannot both
        // hand the same units back.
        ...(canRelease ? { stockReleasedAt: null } : {}),
      },
      data: {
        paymentStatus: 'FAILED',
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: 'Payment was not completed.',
        ...(canRelease ? { stockReleasedAt: new Date() } : {}),
      },
    });
    if (marked.count === 0) return;
    if (canRelease) await restoreStock(tx, order.items);
  });

  console.warn(
    `[order ${order.orderNumber}] payment abandoned` +
      (canRelease ? '; stock released' : ''),
  );
}
