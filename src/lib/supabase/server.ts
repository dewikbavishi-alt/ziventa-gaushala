import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * Note `await cookies()` - it is asynchronous from Next 15 onward. Most
 * Supabase examples still show the synchronous form and will not compile here.
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local.',
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. This is expected and safe to
          // ignore as long as proxy.ts is refreshing the session, which it is.
        }
      },
    },
  });
}

/**
 * Returns the signed-in Supabase user, or null.
 *
 * Always use this rather than `getSession()` on the server: getUser() verifies
 * the JWT with Supabase, whereas getSession() trusts whatever is in the cookie
 * and can therefore be spoofed.
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
