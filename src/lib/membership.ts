import crypto from 'node:crypto';
import type { Prisma } from '@/generated/prisma/client';

/** The founding deposit, in paise. Matches the Membership default. */
export const DEPOSIT_PAISE = 500_000;

/**
 * The founding circle is capped here, by a CHECK constraint on seatNumber, and
 * by the unique index on it. Three places, because a cap that only application
 * code believes in is not a cap.
 */
export const SEATS = 250;

/**
 * The lowest seat nobody is sitting in.
 *
 * Only memberships that actually hold a seat are counted. A family who has
 * left has seatNumber NULL, so their old number is offered to the next family
 * rather than being lost - which is the whole point of releasing a seat, and
 * what used to make the club shrink with every departure.
 *
 * MUST be called inside the same transaction as the write that takes the seat.
 * On its own it is a read whose answer another admin can invalidate a
 * millisecond later; the unique index is what finally refuses a collision, and
 * this only has to be right often enough that the index rarely has to.
 */
export async function lowestFreeSeat(tx: Prisma.TransactionClient): Promise<number> {
  const held = await tx.membership.findMany({
    where: { seatNumber: { not: null } },
    select: { seatNumber: true },
  });

  const used = new Set(held.map((m) => m.seatNumber));
  let seat = 1;
  while (used.has(seat)) seat += 1;
  if (seat > SEATS) throw new Error('CLUB_FULL');
  return seat;
}

/**
 * The token that stands in for a membership in the deposit link.
 *
 * Random rather than derived from the membership id, because an id is
 * sequential enough to guess and this link is the only thing guarding the
 * page - someone who reached another family's deposit page could see their
 * name and seat, and settle a deposit that was not theirs.
 *
 * 32 bytes of CSPRNG output, hex encoded. Not a UUID: a v4 UUID carries only
 * 122 bits and is produced by an API meant for identifiers rather than
 * secrets.
 */
export function newDepositToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Where the deposit email points.
 *
 * Absolute, because it is opened from a mail client that has no page to
 * resolve a relative path against. Falls back to the live domain so a missing
 * environment variable produces a working link rather than a broken one.
 */
export function depositLink(token: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://girbyziventa.com').replace(/\/+$/, '');
  return `${base}/membership/deposit/${token}`;
}
