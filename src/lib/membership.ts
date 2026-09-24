import crypto from 'node:crypto';

/** The founding deposit, in paise. Matches the Membership default. */
export const DEPOSIT_PAISE = 500_000;

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
