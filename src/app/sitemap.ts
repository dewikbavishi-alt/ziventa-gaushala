import type { MetadataRoute } from 'next';

/**
 * Served at /sitemap.xml, which also did not exist.
 *
 * It lists one URL today, and that is the honest state of things rather than
 * an oversight: every part of the public site - the story, the membership,
 * the process, the shop, the reviews - is a hash anchor on "/" rather than a
 * page of its own. A sitemap cannot list #story as a separate entry, because
 * it is not a separate document.
 *
 * That is also why Google shows no sitelinks under the search result: it has
 * exactly one page to work with. Giving those sections real URLs is what
 * would change it, and this file grows the moment they exist.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const site = 'https://girbyziventa.com';

  return [
    {
      url: `${site}/`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];
}
