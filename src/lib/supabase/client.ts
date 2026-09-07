import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase client for Client Components.
 *
 * This uses the anon key, which is public by design and ships in the browser
 * bundle. That is safe ONLY because Row Level Security is enabled on every
 * table - RLS, not secrecy, is what protects the data. Never put the
 * service_role key anywhere this file could reach.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local.',
    );
  }

  return createBrowserClient(url, anonKey);
}
