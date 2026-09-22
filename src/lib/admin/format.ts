/** Display helpers for the admin. Everything money-shaped arrives in paise. */

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const inr2 = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const count = new Intl.NumberFormat('en-IN');

/** Whole rupees, e.g. ₹12,48,320 - Indian digit grouping. */
export const rupees = (paise: number | bigint) => inr.format(Number(paise) / 100);

/** With paise, for order detail where the last rupee matters. */
export const rupeesExact = (paise: number | bigint) => inr2.format(Number(paise) / 100);

/**
 * Compact, in lakhs and crores - how the people reading this actually talk
 * about money. ₹12.5L, not ₹1.25M.
 */
export function rupeesCompact(paise: number | bigint): string {
  const r = Number(paise) / 100;
  const abs = Math.abs(r);
  if (abs >= 1e7) return `₹${(r / 1e7).toFixed(abs >= 1e8 ? 0 : 2)}Cr`;
  if (abs >= 1e5) return `₹${(r / 1e5).toFixed(abs >= 1e6 ? 1 : 2)}L`;
  if (abs >= 1e3) return `₹${(r / 1e3).toFixed(1)}K`;
  return inr.format(r);
}

export const num = (n: number | bigint) => count.format(Number(n));

/**
 * Change against the previous period.
 *
 * Null when there is no previous figure to compare with - "up 100%" from zero
 * is technically true and completely uninformative, and a new shop would see
 * it on every card.
 */
export function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

export function pct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

const dateTime = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const dateOnly = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** Always shown in India time, whatever the server's own timezone is. */
export const when = (d: Date) => dateTime.format(d);
export const day = (d: Date) => dateOnly.format(d);
