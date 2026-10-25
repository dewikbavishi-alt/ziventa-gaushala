import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client with the service role key.
 *
 * This key bypasses every row-level security rule in the database and can act
 * as any user. The `server-only` import at the top is load-bearing: if this
 * file is ever pulled into a Client Component by mistake, the BUILD fails
 * rather than the key quietly shipping to every visitor's browser.
 *
 * Used for one job here - asking Supabase to mint a sign-in link without
 * sending an email, so we can send it ourselves through Nodemailer.
 */
export function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Supabase admin is not configured');
  }

  return createClient(url, key, {
    auth: {
      // No session to persist or refresh: every call is a one-off from a
      // server that must not carry anyone's identity between requests.
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Does an account already exist for this address?
 *
 * Needed because `generateLink({type:'magiclink'})` CREATES the account when
 * it is missing - verified against a real project, where two addresses that
 * had never signed up appeared as accounts immediately after a link was
 * generated for them. Signing in must never do that: a mistyped address would
 * otherwise produce a new empty account, and the person would conclude their
 * orders had vanished.
 *
 * Uses the admin users endpoint's `filter`, which matches on email. The
 * supabase-js client does not expose it, so this is a direct call.
 */
export async function accountExists(email: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase admin is not configured');

  const res = await fetch(
    `${url}/auth/v1/admin/users?filter=${encodeURIComponent(email)}&per_page=50`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' },
  );

  if (!res.ok) throw new Error(`Admin user lookup failed: ${res.status}`);

  const body = (await res.json()) as { users?: { email?: string }[] };
  // `filter` is a substring match, so confirm an exact address rather than
  // trusting that a hit is the right person.
  const wanted = email.toLowerCase();
  return (body.users ?? []).some((u) => u.email?.toLowerCase() === wanted);
}

/**
 * The same question for a phone number, which the admin `filter` does NOT
 * search.
 *
 * `filter` matches on email only - pass it a number and it returns nothing, so
 * every number would look unregistered and phone sign-in would create an
 * account for each typo. This pages through users and compares the phone field
 * instead.
 *
 * Linear in the size of the user table, which is fine at a few thousand and
 * wrong at a million. If this shop ever outgrows it, keep a phone column on
 * Customer and look it up there; Supabase has no indexed phone lookup on the
 * admin API to replace this with.
 *
 * @param e164 must already be normalised - see src/lib/phone.ts.
 */
export async function accountExistsByPhone(e164: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase admin is not configured');

  const wanted = e164.replace(/\D/g, '');
  const perPage = 200;
  // A ceiling rather than "until empty": a bug in the paging condition would
  // otherwise spin here on every sign-in attempt.
  const maxPages = 25;

  for (let page = 1; page <= maxPages; page++) {
    const res = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=${perPage}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Admin user lookup failed: ${res.status}`);

    const body = (await res.json()) as { users?: { phone?: string | null }[] };
    const users = body.users ?? [];
    if (users.length === 0) return false;

    // Supabase stores the number without a plus, so compare digits only.
    if (users.some((u) => u.phone && u.phone.replace(/\D/g, '') === wanted)) return true;
    if (users.length < perPage) return false;
  }

  console.warn('[auth-sms] phone lookup hit the page ceiling; treating as not found');
  return false;
}
