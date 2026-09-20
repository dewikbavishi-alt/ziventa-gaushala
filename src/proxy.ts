import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Next.js 16 renamed Middleware to Proxy. The file must be `proxy.ts` and the
 * export must be `proxy` (or a default export) - a `middleware.ts` file is
 * simply ignored, which is a silent failure worth knowing about, because every
 * Supabase guide still tells you to create `middleware.ts`.
 *
 * Its only job here is to refresh the Supabase auth token on each request and
 * write the rotated cookies onto the response. Without it, sessions expire
 * mid-visit and Server Components see a signed-out user.
 *
 * Deliberately NOT doing authorisation here: proxy runs before the route and
 * cannot be the only gate. Real checks belong next to the data - see
 * getCurrentUser() in src/lib/supabase/server.ts.
 */
export async function proxy(request: NextRequest) {
  /**
   * The path, passed along as a header.
   *
   * A layout cannot see which page below it is being rendered, so the account
   * layout had no way to say where to return after signing in - every deep
   * link came back as plain /your-account, dropping someone who followed a
   * link to their orders onto the hub instead. Setting it here is the
   * supported way to get it there.
   */
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', request.nextUrl.pathname);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Not configured yet: pass the request through untouched rather than
  // throwing on every page load.
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        // Rebuilt with the same headers, or x-pathname is lost whenever the
        // session happens to be refreshed on this request.
        response = NextResponse.next({ request: { headers: requestHeaders } });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // This call is what actually performs the refresh. Do not remove it.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Skip static assets and image files - running auth refresh on every image
  // request is pure overhead.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)',
  ],
};
