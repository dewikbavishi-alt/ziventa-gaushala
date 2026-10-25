/**
 * Phone numbers, in the one format Supabase accepts.
 *
 * Safe on both sides - no `server-only` here, because the sign-in form shows
 * the number it is about to send to and the route has to normalise the same
 * string the same way. This used to live as a private toE164 at the bottom of
 * auth-form.tsx; once the send moved to the server, two copies would have been
 * two chances to text +919876543210 and verify against +91 98765 43210.
 */

/**
 * Default country for a bare national number, as a dialling code without the
 * plus. India, because that is where the customers are. Both NEXT_PUBLIC_ and
 * bare are read so the same value resolves in the browser and on the server.
 */
function defaultCc(): string {
  const raw = process.env.NEXT_PUBLIC_OTP_DEFAULT_CC ?? process.env.OTP_DEFAULT_CC ?? '91';
  return raw.replace(/\D/g, '') || '91';
}

/** E.164: a plus, then digits, nothing else. `+919876543210` */
export function toE164(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const cc = defaultCc();

  if (raw.trim().startsWith('+')) return `+${digits}`;
  // A plain national number - ten digits in India.
  if (digits.length === 10) return `+${cc}${digits}`;
  // Carries the country code already but lost its plus somewhere.
  if (digits.startsWith(cc) && digits.length > cc.length + 6) return `+${digits}`;
  return `+${digits}`;
}

/**
 * Is this plausibly a phone number?
 *
 * A shape check, not a validation. E.164 allows 15 digits at most and no real
 * number is under 8 including its country code. Whether a number is REACHABLE
 * is what the SMS finds out - and on a channel billed per message, a cheap
 * check in front of it is worth more than a clever regex that still cannot
 * tell you that.
 */
export function looksLikePhone(e164: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(e164);
}

/** `+9198***3210` - enough to recognise in a log, not enough to identify. */
export function maskPhone(e164: string): string {
  if (e164.length < 8) return '***';
  return `${e164.slice(0, 5)}***${e164.slice(-4)}`;
}
