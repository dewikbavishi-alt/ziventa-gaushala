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
