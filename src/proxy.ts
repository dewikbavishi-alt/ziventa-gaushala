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
/**
 * The one domain the live site should ever be served on.
 *
 * Vercel keeps the project's own *.vercel.app address serving alongside a
 * custom domain, so girbyziventa.com and ziventag.vercel.app were both
 * answering with the whole site. That is not just untidy:
 *
 *  - Cookies are per-domain, so a customer signed in on girbyziventa.com is a
 *    stranger on the vercel.app one. Landing there sends them to /login even
 *    though they are signed in, which is exactly how this was noticed.
 *  - Search engines can index both and split the ranking between them.
 *  - Analytics, the visitor table and any saved cart are counted twice.
 */
const CANONICAL_HOST = process.env.CANONICAL_HOST ?? 'girbyziventa.com';

export async function proxy(request: NextRequest) {
  /**
   * Send everything to the one domain, before any other work.
   *
   * Only in production. Preview deployments each get their own *.vercel.app
   * address, and bouncing those to production would make it impossible to test
   * a branch before it ships. Local development has no VERCEL_ENV at all.
   *
   * 308 rather than 302 so it is cached as permanent and the method is
   * preserved, and the path and query ride along - someone following a link to
   * their orders still arrives at their orders.
   */
  if (process.env.VERCEL_ENV === 'production') {
    /**
     * Read the host from the headers, not from nextUrl.
     *
     * nextUrl.hostname is built from the URL the server sees, which is not
     * always the public one - proven locally, where it reports `localhost` and
     * so treated EVERY host as wrong, including the canonical one. That is an
     * infinite redirect loop on the real domain, which would take the whole
     * site down rather than merely tidy it up.
     *
     * x-forwarded-host first because that is what a proxy sets when it
     * rewrites Host; the port is stripped so a host:443 never fails to match.
     */
    const host = (request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '')
      .split(':')[0]
      .toLowerCase();

    if (host && host !== CANONICAL_HOST) {
      const target = new URL(request.nextUrl);
      target.protocol = 'https:';
      target.hostname = CANONICAL_HOST;
      target.port = '';
      return NextResponse.redirect(target, 308);
    }
  }

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
