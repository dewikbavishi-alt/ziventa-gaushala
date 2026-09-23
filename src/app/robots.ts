import type { MetadataRoute } from 'next';

/**
 * Served at /robots.txt, which did not exist until now - the site was being
 * crawled with no guidance at all.
 *
 * The point is not to hide anything. /admin and /your-account already refuse
 * anyone without a session, so nothing private was ever exposed. It is that a
 * crawler spends a fixed amount of effort per site, and every request it
 * wastes on a page that only ever answers "sign in first" is a request it did
 * not spend on a page that should rank.
 *
 * /login and /signup are excluded for a different reason: they would be
 * indexed successfully, and "Sign in | Ziventa Gaushala" is not a result
 * anyone searching for ghee wants to land on.
 */
export default function robots(): MetadataRoute.Robots {
  const site = 'https://girbyziventa.com';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/your-account', '/api/', '/login', '/signup', '/auth/'],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
    // Tells Google which of several possible addresses is the real one. The
    // vercel.app domain already 308s here, and this says the same thing to
    // anything that reads robots.txt before following the redirect.
    host: site,
  };
}
