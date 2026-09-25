import crypto from 'node:crypto';
import { prisma } from './prisma';
import type { Prisma } from '@/generated/prisma/client';

/** Rs 99 delivery, free over Rs 1,500. Stored in paise. */
export const SHIPPING_PAISE = 9_900;
export const FREE_SHIPPING_OVER_PAISE = 150_000;

export class CartError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** Confusable characters (I, O, 0, 1) are left out so codes survive a phone call. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function code(prefix: string, length: number, now: Date): string {
  const stamp =
    String(now.getUTCFullYear()).slice(2) +
    String(now.getUTCMonth() + 1).padStart(2, '0') +
    String(now.getUTCDate()).padStart(2, '0');
  let suffix = '';
  for (const b of crypto.randomBytes(length)) suffix += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `${prefix}-${stamp}-${suffix}`;
}

/** ZV-260907-K7QM4P */
export function generateOrderNumber(now = new Date()): string {
  return code('ZV', 6, now);
}

/** ZGC-260908-A7K2 - the Gir Gold Club reservation a customer can quote. */
export function generateReservationReference(now = new Date()): string {
  return code('ZGC', 4, now);
}

export interface CartLine {
  slug: string;
  quantity: number;
}

/**
 * Work out what the cart really costs, using prices from the database.
 *
 * The browser only ever sends a product id and a quantity. Every price, line
 * total and the grand total are calculated here. Someone editing the page in
 * their browser cannot change what they get charged, because the request has
 * no price field to tamper with in the first place.
 *
 * `isMember` is the same kind of fact and follows the same rule: the CALLER
 * establishes it from the session, never from the request body. If it ever
 * arrives from the browser, anyone can pay the member rate by editing one
 * boolean - see memberRateApplies() for where it is actually decided.
 */
export async function priceCart(lines: CartLine[], { isMember = false } = {}) {
  if (lines.length === 0) throw new CartError('Your cart is empty');

  // Merge duplicate lines rather than trusting the browser to have done it.
  const wanted = new Map<string, number>();
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      throw new CartError(`Invalid quantity for "${line.slug}"`);
    }
    if (line.quantity > 50) {
      throw new CartError(`Maximum 50 per item ("${line.slug}")`);
    }
    wanted.set(line.slug, (wanted.get(line.slug) ?? 0) + line.quantity);
  }

  const products = await prisma.product.findMany({
    where: { slug: { in: [...wanted.keys()] }, isActive: true },
  });
  const bySlug = new Map(products.map((p) => [p.slug, p]));

  const missing = [...wanted.keys()].filter((s) => !bySlug.has(s));
  if (missing.length > 0) {
    throw new CartError(`No longer available: ${missing.join(', ')}`, 409);
  }

  /**
   * Refuse what we cannot supply, before anything is charged or recorded.
   *
   * This is a courtesy, not the guard. It gives the customer a message that
   * names the product and the number left, which reserveStock cannot do
   * without a second read. The guard is the conditional UPDATE in
   * reserveStock, because between this check and that write another order can
   * always land.
   */
  for (const [slug, quantity] of wanted) {
    const product = bySlug.get(slug)!;
    if (product.stockCount === null) continue; // Not a counted product.
    if (product.stockCount === 0) {
      throw new CartError(`${product.name} has just sold out.`, 409);
    }
    if (product.stockCount < quantity) {
      throw new CartError(
        `Only ${product.stockCount} left of ${product.name}. Please lower the quantity.`,
        409,
      );
    }
  }

  const items = [...wanted.entries()].map(([slug, quantity]) => {
    const product = bySlug.get(slug)!;
    return {
      productId: product.id,
      productName: product.name,
      // The one place the member rate is chosen. Snapshotted onto the order
      // line, so what was charged stays readable years later even if either
      // price changes or the family later leaves the club.
      unitPricePaise: isMember ? product.memberPricePaise : product.pricePaise,
      quantity,
    };
  });

  /**
   * What the member rate saved on this cart, for showing back to them.
   *
   * Zero for a guest. Worth returning rather than recomputing in the route,
   * because it must be the difference between the SAME two numbers the lines
   * above were built from.
   */
  const savedPaise = isMember
    ? [...wanted.entries()].reduce((sum, [slug, quantity]) => {
        const p = bySlug.get(slug)!;
        return sum + (p.pricePaise - p.memberPricePaise) * quantity;
      }, 0)
    : 0;

  /**
   * Only the products we actually count. Kept apart from `items` because that
   * array is passed straight to Prisma as the OrderItem rows to create, and
   * an extra field there would be rejected.
   */
  const tracked: StockLine[] = [...wanted.entries()]
    .filter(([slug]) => bySlug.get(slug)!.stockCount !== null)
    .map(([slug, quantity]) => {
      const product = bySlug.get(slug)!;
      return { productId: product.id, productName: product.name, quantity };
    });

  const subtotalPaise = items.reduce((sum, i) => sum + i.unitPricePaise * i.quantity, 0);
  const shippingPaise = subtotalPaise >= FREE_SHIPPING_OVER_PAISE ? 0 : SHIPPING_PAISE;

  return {
    items,
    tracked,
    subtotalPaise,
    shippingPaise,
    totalPaise: subtotalPaise + shippingPaise,
    isMember,
    savedPaise,
  };
}

/**
 * Whether this customer gets the member rate right now.
 *
 * ACTIVE only. PENDING means a seat was confirmed but the refundable deposit
 * has not arrived, and the deposit is the thing the rate is in return for -
 * so PENDING pays the regular price until it lands, at which point the seat
 * becomes ACTIVE on its own. PAUSED and LEFT are not current members either.
 *
 * A guest is never a member: there is no id to look up, and taking the claim
 * from the browser is what would make the whole two-tier scheme free.
 */
export async function memberRateApplies(customerId: string | null): Promise<boolean> {
  if (!customerId) return false;
  const membership = await prisma.membership.findUnique({
    where: { customerId },
    select: { status: true },
  });
  return membership?.status === 'ACTIVE';
}

export interface StockLine {
  productId: string;
  productName: string;
  quantity: number;
}

/**
 * Take the ordered units out of stock.
 *
 * MUST be called inside a transaction, alongside the order insert, so the sale
 * and the stock movement either both happen or neither does. An order recorded
 * without its decrement oversells; a decrement without its order loses stock
 * that was never sold.
 *
 * The availability test lives in the WHERE clause rather than in a read
 * beforehand:
 *
 *   UPDATE products SET stockCount = stockCount - 2
 *    WHERE id = ... AND stockCount >= 2
 *
 * Postgres locks the row and evaluates that condition itself, so when two
 * customers reach for the last two jars at the same moment, the second finds
 * the condition false and matches nothing. Reading the count first and
 * deciding in JavaScript is the bug this avoids: both requests would read 2,
 * both would decide it was fine, and one family would get an email for a jar
 * that does not exist.
 *
 * Throwing rolls the transaction back, which is how the whole order is
 * abandoned rather than half-written.
 */
export async function reserveStock(tx: Prisma.TransactionClient, lines: StockLine[]) {
  for (const line of lines) {
    const claimed = await tx.product.updateMany({
      where: { id: line.productId, stockCount: { gte: line.quantity } },
      data: { stockCount: { decrement: line.quantity } },
    });

    if (claimed.count === 0) {
      // Either it sold out in the moment since priceCart looked, or somebody
      // untracked it. Both mean: do not promise this order.
      throw new CartError(
        `${line.productName} sold out while you were checking out. Nothing has been ordered.`,
        409,
      );
    }
  }
}

/**
 * Give the units back, for an order that is cancelled or returned.
 *
 * Only ever called for an order that reserved stock in the first place and has
 * not been released yet - see releaseOrderStock in the admin action, which
 * checks both stamps inside the same transaction that moves the status.
 */
export async function restoreStock(tx: Prisma.TransactionClient, lines: StockLine[]) {
  for (const line of lines) {
    // Untracked products are skipped: null + 2 is null, and a product that is
    // not counted must not suddenly acquire a count from a cancellation.
    await tx.product.updateMany({
      where: { id: line.productId, stockCount: { not: null } },
      data: { stockCount: { increment: line.quantity } },
    });
  }
}
