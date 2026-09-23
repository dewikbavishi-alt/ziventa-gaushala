import type { MetadataRoute } from 'next';

/**
 * Served at /robots.txt.
 *
 * Sign-in, sign-up and the account section are crawlable at your request. I
 * had excluded them; that is reversed.
 *
 * Worth knowing what each one can actually become:
 *
 *  - /login and /signup answer 200 with real titles and no noindex, so once
 *    they are allowed they can be indexed and can show in results.
 *
 *  - /your-account and everything under it answer 307 to /login for anyone
 *    without a session. A crawler is anonymous, so that is all it will ever
 *    see. Google does not index a redirect; it follows it and credits the
 *    destination. Allowing it therefore does not put the account pages in
 *    search - it just lets the "Your Account" link in the footer be followed,
 *    which passes that signal on to /login. There is no way to make the
 *    account pages themselves appear without making customers' order history
 *    public, which is not a trade worth making.
 *
 * /admin stays blocked. It is the owner-only dashboard and has no business in
 * a search index. /api and /auth are machine endpoints, not pages.
 */
export default function robots(): MetadataRoute.Robots {
  const site = 'https://girbyziventa.com';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api/', '/auth/'],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
    // Which of several possible addresses is the real one. The vercel.app
    // domain already 308s here; this says the same to anything that reads
    // robots.txt before following a redirect.
    host: site,
  };
}
