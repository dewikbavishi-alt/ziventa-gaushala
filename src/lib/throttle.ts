import 'server-only';
import crypto from 'node:crypto';
import { prisma } from '@/lib/prisma';

/**
 * Per-device limits for the public forms - checkout and pre-registration.
 *
 * Both used to be limited only per email address, which a script defeats by
 * changing the address each time: unlimited orders (each reserving stock and
 * emailing whatever address was typed) and unlimited pre-registrations. These
 * limits count by the network address the request came from instead.
 *
 * The ledger is the email_throttle table, which already records "this key did
 * this kind of thing at this time" for sign-in codes. Rows written here use a
 * key of the form `ip:<hash>` in its `email` column and their own `kind`, so
 * they never count against a sign-in code allowance.
 *
 * The address is stored only as a salted hash: enough to recognise the same
 * device again within a day, useless for finding out who it was.
 */

export interface Limit {
  max: number;
  minutes: number;
}

/**
 * The client's address, as Vercel reports it.
 *
 * On Vercel the first x-forwarded-for entry is set by Vercel's own edge and
 * cannot be forged by the client. IPv6 is cut to its /64: a single household
 * or server is usually handed a whole /64, so counting full addresses would
 * let one machine rotate through billions of them.
 */
function clientAddress(request: Request): string | null {
  const raw =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    '';
  if (!raw) return null;
  if (raw.includes(':')) {
    return raw.split(':').slice(0, 4).join(':') + '::/64';
  }
  return raw;
}

function salt(): string {
  // Any server-only secret will do; it only has to stay off the page.
  return process.env.THROTTLE_SALT ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'ziventa-throttle';
}

/** `ip:<hash>` for this request, or null when there is no address (local dev). */
export function deviceKey(request: Request): string | null {
  const addr = clientAddress(request);
  if (!addr) return null;
  const hash = crypto.createHmac('sha256', salt()).update(addr).digest('hex').slice(0, 32);
  return `ip:${hash}`;
}

/**
 * Checks every limit for this key and kind, and records the attempt if all
 * pass. Returns the number of minutes to wait when one is exceeded.
 *
 * Count-then-insert is not atomic, so a burst of simultaneous requests can
 * slip one or two past a limit. That is acceptable here: the point is to stop
 * a script placing hundreds, not to count to the exact request.
 */
export async function takeAllowance(
  key: string | null,
  kind: string,
  limits: Limit[],
): Promise<{ ok: true } | { ok: false; retryMinutes: number }> {
  if (!key) return { ok: true };

  for (const limit of limits) {
    const since = new Date(Date.now() - limit.minutes * 60_000);
    const used = await prisma.emailThrottle.count({
      where: { email: key, kind, sentAt: { gte: since } },
    });
    if (used >= limit.max) {
      console.warn(`[throttle] ${kind} refused for ${key.slice(0, 11)}…: ${used} in ${limit.minutes}m`);
      return { ok: false, retryMinutes: limit.minutes };
    }
  }

  await prisma.emailThrottle.create({ data: { email: key, kind } });

  // Housekeeping, now and then: nothing here looks back more than a day.
  if (Math.random() < 0.02) {
    prisma.emailThrottle
      .deleteMany({
        where: { email: { startsWith: 'ip:' }, sentAt: { lt: new Date(Date.now() - 2 * 86_400_000) } },
      })
      .catch(() => {});
  }

  return { ok: true };
}

/** A friendly wait, for the message shown to a person who hit a limit. */
export function waitPhrase(minutes: number): string {
  if (minutes >= 24 * 60) return 'tomorrow';
  if (minutes >= 60) return 'in an hour or so';
  return 'in a few minutes';
}
