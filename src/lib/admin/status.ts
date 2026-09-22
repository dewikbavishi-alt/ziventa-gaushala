/**
 * Order and payment statuses: what they are called, what colour they are, and
 * which moves between them are allowed.
 *
 * Plain strings rather than the Prisma enums, so this file can be imported by
 * client components without dragging the database client into the browser.
 */

export const ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'DISPATCHED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'RETURNED',
] as const;
export type OrderStatusKey = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'PENDING',
  'PAID',
  'FAILED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
] as const;
export type PaymentStatusKey = (typeof PAYMENT_STATUSES)[number];

export const ORDER_LABEL: Record<OrderStatusKey, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Processing',
  DISPATCHED: 'Dispatched',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
};

export const PAYMENT_LABEL: Record<PaymentStatusKey, string> = {
  PENDING: 'Pending',
  PAID: 'Paid',
  FAILED: 'Failed',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Part refunded',
};

export type Tone = 'green' | 'amber' | 'blue' | 'violet' | 'red' | 'grey' | 'orange';

export const ORDER_TONE: Record<OrderStatusKey, Tone> = {
  PENDING: 'amber',
  CONFIRMED: 'blue',
  PROCESSING: 'orange',
  DISPATCHED: 'violet',
  OUT_FOR_DELIVERY: 'violet',
  DELIVERED: 'green',
  CANCELLED: 'red',
  RETURNED: 'grey',
};

export const PAYMENT_TONE: Record<PaymentStatusKey, Tone> = {
  PENDING: 'amber',
  PAID: 'green',
  FAILED: 'red',
  REFUNDED: 'grey',
  PARTIALLY_REFUNDED: 'grey',
};

/**
 * Where an order may go next.
 *
 * The admin chooses, but not freely: an order cannot be un-delivered, a
 * cancelled order cannot be dispatched, and a returned order is finished.
 * Enforced on the server in the action as well as here, since this list only
 * decides which buttons are drawn - a direct POST would skip the buttons
 * entirely.
 *
 * Skipping forward is allowed (PENDING straight to DISPATCHED), because a
 * small shop often confirms and packs in one go and should not have to click
 * through every stage to record it.
 */
export const NEXT_STATUSES: Record<OrderStatusKey, OrderStatusKey[]> = {
  PENDING: ['CONFIRMED', 'PROCESSING', 'DISPATCHED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'DISPATCHED', 'CANCELLED'],
  PROCESSING: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'RETURNED'],
  DELIVERED: ['RETURNED'],
  CANCELLED: [],
  RETURNED: [],
};

export function canMove(from: OrderStatusKey, to: OrderStatusKey): boolean {
  return NEXT_STATUSES[from].includes(to);
}

/** Gir Gold Club enquiries. Stored as plain text in leads.status. */
export const LEAD_STATUSES = ['new', 'contacted', 'converted', 'declined'] as const;
export type LeadStatusKey = (typeof LEAD_STATUSES)[number];

export const LEAD_TONE: Record<LeadStatusKey, Tone> = {
  new: 'amber',
  contacted: 'blue',
  converted: 'green',
  declined: 'grey',
};

/** The shipping picture, read from the order status - one source of truth. */
export function shippingLabel(status: OrderStatusKey): string {
  switch (status) {
    case 'PENDING':
    case 'CONFIRMED':
    case 'PROCESSING':
      return 'Not shipped';
    case 'DISPATCHED':
      return 'In transit';
    case 'OUT_FOR_DELIVERY':
      return 'Out for delivery';
    case 'DELIVERED':
      return 'Delivered';
    case 'CANCELLED':
      return '—';
    case 'RETURNED':
      return 'Returned';
  }
}
