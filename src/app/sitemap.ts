import type { MetadataRoute } from 'next';

/**
 * Served at /sitemap.xml.
 *
 * Only pages that can actually be indexed belong here. /login and /signup
 * qualify: they answer 200 with their own titles and descriptions.
 *
 * /your-account is deliberately absent even though it is now crawlable. It
 * answers 307 to /login for anyone without a session, and listing a redirect
 * in a sitemap is reported back as an error in Search Console - it tells
 * Google "index this" about a URL that can never be indexed. The footer link
 * is enough for it to be discovered and followed.
 *
 * Still one real content page. Every section of the site - the story, the
 * club, the process, the shop - is a hash anchor on "/" rather than a page of
 * its own, and #story cannot be listed separately because it is not a separate
 * document. This grows when those sections get real URLs.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const site = 'https://girbyziventa.com';
  const now = new Date();

  return [
    { url: `${site}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${site}/login`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${site}/signup`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
