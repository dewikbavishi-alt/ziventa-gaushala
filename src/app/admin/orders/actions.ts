'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/admin';
import { canMove, ORDER_LABEL, ORDER_STATUSES, type OrderStatusKey } from '@/lib/admin/status';
import type { ActionResult } from '@/components/admin/action-form';

/**
 * Order management.
 *
 * Every action here:
 *   1. calls requireAdmin() first - Server Actions are reachable by a direct
 *      POST, so the page being admin-only protects nothing on its own;
 *   2. validates its input with Zod - never trusting what the form sent;
 *   3. writes with the EXPECTED current status in the WHERE clause, so two
 *      admins acting on one order at once cannot silently overwrite each
 *      other: the second finds nothing to update and is told to reload.
 */

const fail = (message: string): ActionResult => ({ ok: false, message });
const uuid = z.string().uuid();

/** Which timestamp to stamp when an order enters each state. */
const STAMP: Partial<Record<OrderStatusKey, string>> = {
  CONFIRMED: 'confirmedAt',
  DISPATCHED: 'dispatchedAt',
  DELIVERED: 'deliveredAt',
  CANCELLED: 'cancelledAt',
  RETURNED: 'returnedAt',
};

function refresh(orderId: string) {
  revalidatePath('/admin', 'layout');
  revalidatePath(`/admin/orders/${orderId}`);
  // The customer's own order page shows the status too.
  revalidatePath('/your-account/orders');
}

export async function changeStatus(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch {
    return fail('You are no longer signed in as an admin.');
  }

  const parsed = z
    .object({
      orderId: uuid,
      status: z.enum(ORDER_STATUSES),
      cancelReason: z.string().trim().max(300).optional(),
      courier: z.string().trim().max(80).optional(),
      trackingNumber: z.string().trim().max(80).optional(),
    })
    .safeParse({
      orderId: formData.get('orderId'),
      status: formData.get('status'),
      cancelReason: formData.get('cancelReason') ?? undefined,
      courier: formData.get('courier') ?? undefined,
      trackingNumber: formData.get('trackingNumber') ?? undefined,
    });
  if (!parsed.success) return fail('That update was not valid.');
  const { orderId, status: next, cancelReason, courier, trackingNumber } = parsed.data;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true, orderNumber: true },
  });
  if (!order) return fail('That order no longer exists.');

  const current = order.status as OrderStatusKey;
  if (current === next) return fail(`Already ${ORDER_LABEL[next].toLowerCase()}.`);

  // The same rule the buttons follow - enforced here because a direct POST
  // never sees the buttons.
  if (!canMove(current, next)) {
    return fail(`An order cannot go from ${ORDER_LABEL[current]} to ${ORDER_LABEL[next]}.`);
  }

  const stamp = STAMP[next];
  const result = await prisma.order.updateMany({
    // Optimistic concurrency: only succeeds if nobody moved it meanwhile.
    where: { id: orderId, status: current },
    data: {
      status: next,
      ...(stamp ? { [stamp]: new Date() } : {}),
      ...(next === 'CANCELLED' && cancelReason ? { cancelReason } : {}),
      ...(next === 'DISPATCHED' && courier ? { courier } : {}),
      ...(next === 'DISPATCHED' && trackingNumber ? { trackingNumber } : {}),
    },
  });

  if (result.count === 0) {
    return fail('Someone else changed this order a moment ago. Reload to see it.');
  }

  refresh(orderId);
  return { ok: true, message: `${order.orderNumber} marked ${ORDER_LABEL[next].toLowerCase()}.` };
}

/**
 * Record whether the money arrived. Refunds have their own action below,
 * because they carry an amount and must never exceed what was charged.
 */
export async function changePayment(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch {
    return fail('You are no longer signed in as an admin.');
  }

  const parsed = z
    .object({
      orderId: uuid,
      paymentStatus: z.enum(['PENDING', 'PAID', 'FAILED']),
      paymentReference: z.string().trim().max(120).optional(),
    })
    .safeParse({
      orderId: formData.get('orderId'),
      paymentStatus: formData.get('paymentStatus'),
      paymentReference: formData.get('paymentReference') || undefined,
    });
  if (!parsed.success) return fail('That payment update was not valid.');
  const { orderId, paymentStatus, paymentReference } = parsed.data;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { paymentStatus: true, orderNumber: true, refundedPaise: true },
  });
  if (!order) return fail('That order no longer exists.');

  // Once money has gone back, flipping the order to "pending" or "failed"
  // would hide a refund that really happened.
  if (order.refundedPaise > 0) {
    return fail('This order has a refund recorded, so its payment status is fixed.');
  }

  await prisma.order.update({
    where: { id: orderId },
    data: { paymentStatus, ...(paymentReference ? { paymentReference } : {}) },
  });

  refresh(orderId);
  return { ok: true, message: `${order.orderNumber} payment marked ${paymentStatus.toLowerCase()}.` };
}

/**
 * Record a refund.
 *
 * This RECORDS money going back; it does not move any. There is no payment
 * gateway connected, so the refund itself is made by bank transfer or UPI,
 * and this keeps the books honest about it. When Razorpay is connected, this
 * is where its refund API would be called.
 *
 * The amount is capped at what is still unrefunded - a check in the database
 * enforces that too, so even a bug here could not book more than was paid.
 */
export async function recordRefund(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch {
    return fail('You are no longer signed in as an admin.');
  }

  const parsed = z
    .object({
      orderId: uuid,
      // Rupees as typed, up to two decimal places.
      amount: z.string().trim().regex(/^\d{1,7}(\.\d{1,2})?$/, 'Enter an amount like 449 or 449.50'),
      markReturned: z.enum(['on']).optional(),
    })
    .safeParse({
      orderId: formData.get('orderId'),
      amount: formData.get('amount'),
      markReturned: formData.get('markReturned') ?? undefined,
    });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'That refund was not valid.');
  }

  // Integer paise from the typed string - no floating point anywhere near money.
  const [whole, frac = ''] = parsed.data.amount.split('.');
  const paise = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (paise <= 0) return fail('A refund must be more than nothing.');

  const order = await prisma.order.findUnique({
    where: { id: parsed.data.orderId },
    select: { orderNumber: true, totalPaise: true, refundedPaise: true, status: true, paymentStatus: true },
  });
  if (!order) return fail('That order no longer exists.');

  const remaining = order.totalPaise - order.refundedPaise;
  if (paise > remaining) {
    return fail(`Only ₹${(remaining / 100).toFixed(2)} is left to refund on this order.`);
  }

  const refunded = order.refundedPaise + paise;
  const returning =
    parsed.data.markReturned === 'on' && canMove(order.status as OrderStatusKey, 'RETURNED');

  const result = await prisma.order.updateMany({
    where: { id: parsed.data.orderId, refundedPaise: order.refundedPaise },
    data: {
      refundedPaise: refunded,
      paymentStatus: refunded >= order.totalPaise ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
      ...(returning ? { status: 'RETURNED', returnedAt: new Date() } : {}),
    },
  });

  if (result.count === 0) {
    return fail('A refund was recorded on this order a moment ago. Reload to see it.');
  }

  refresh(parsed.data.orderId);
  return {
    ok: true,
    message: `Recorded a ₹${(paise / 100).toFixed(2)} refund on ${order.orderNumber}.`,
  };
}

/**
 * Fill in the delivery state on an order placed before checkout asked for
 * one. Every order from before 12 September is missing it, and GST and courier
 * rates both depend on it.
 */
export async function setShipState(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch {
    return fail('You are no longer signed in as an admin.');
  }

  const parsed = z
    .object({ orderId: uuid, state: z.string().trim().min(2).max(120) })
    .safeParse({ orderId: formData.get('orderId'), state: formData.get('state') });
  if (!parsed.success) return fail('Enter the state name.');

  await prisma.order.update({
    where: { id: parsed.data.orderId },
    data: { shipState: parsed.data.state },
  });

  refresh(parsed.data.orderId);
  return { ok: true, message: `Delivery state set to ${parsed.data.state}.` };
}

/** Courier and tracking number, without moving the order's status. */
export async function updateShipping(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch {
    return fail('You are no longer signed in as an admin.');
  }

  const parsed = z
    .object({
      orderId: uuid,
      courier: z.string().trim().max(80),
      trackingNumber: z.string().trim().max(80),
    })
    .safeParse({
      orderId: formData.get('orderId'),
      courier: formData.get('courier') ?? '',
      trackingNumber: formData.get('trackingNumber') ?? '',
    });
  if (!parsed.success) return fail('Those shipping details were not valid.');

  await prisma.order.update({
    where: { id: parsed.data.orderId },
    data: {
      courier: parsed.data.courier || null,
      trackingNumber: parsed.data.trackingNumber || null,
    },
  });

  refresh(parsed.data.orderId);
  return { ok: true, message: 'Shipping details saved.' };
}
