import crypto from 'node:crypto';
import { prisma } from './prisma';

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

/** ZV-260907-K7QM4P. Confusable characters (I, O, 0, 1) left out. */
export function generateOrderNumber(now = new Date()): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const stamp =
    String(now.getUTCFullYear()).slice(2) +
    String(now.getUTCMonth() + 1).padStart(2, '0') +
    String(now.getUTCDate()).padStart(2, '0');
  let suffix = '';
  for (const b of crypto.randomBytes(6)) suffix += alphabet[b % alphabet.length];
  return `ZV-${stamp}-${suffix}`;
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
 */
export async function priceCart(lines: CartLine[]) {
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

  const items = [...wanted.entries()].map(([slug, quantity]) => {
    const product = bySlug.get(slug)!;
    return {
      productId: product.id,
      productName: product.name,
      unitPricePaise: product.pricePaise,
      quantity,
    };
  });

  const subtotalPaise = items.reduce((sum, i) => sum + i.unitPricePaise * i.quantity, 0);
  const shippingPaise =
    subtotalPaise >= FREE_SHIPPING_OVER_PAISE ? 0 : SHIPPING_PAISE;

  return { items, subtotalPaise, shippingPaise, totalPaise: subtotalPaise + shippingPaise };
}
