/**
 * How an order is described to the person who placed it.
 *
 * One copy, shared by the hub and the orders page, because the two showing
 * different words for the same order is exactly the kind of thing nobody
 * notices until a customer asks which one is right. Kept in step with the
 * admin's statuses in src/lib/admin/status.ts - same stages, customer words.
 */

export const STATUS_TEXT: Record<string, string> = {
  PENDING: 'Awaiting confirmation',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Being packed',
  DISPATCHED: 'On its way',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
};

const STATUS_COLOUR: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  CONFIRMED: 'bg-sky-100 text-sky-800',
  PROCESSING: 'bg-orange-100 text-orange-800',
  DISPATCHED: 'bg-violet-100 text-violet-800',
  OUT_FOR_DELIVERY: 'bg-violet-100 text-violet-800',
  DELIVERED: 'bg-emerald-100 text-emerald-900',
  CANCELLED: 'bg-stone-200 text-stone-700',
  RETURNED: 'bg-stone-200 text-stone-700',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium ${
        STATUS_COLOUR[status] ?? 'bg-stone-200 text-stone-700'
      }`}
    >
      {STATUS_TEXT[status] ?? status}
    </span>
  );
}

/** Money is stored in paise; nothing shown to a customer ever is. */
export const rs = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/**
 * Dates are pinned to IST rather than the server's zone. Vercel runs in UTC,
 * where an order placed at 1am in India would otherwise be shown as the day
 * before.
 */
export const when = (d: Date) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
