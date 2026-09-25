import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';

/**
 * First-party page-view beacon.
 *
 * Deliberately collects as little as the dashboard needs. The user-agent is
 * reduced to two category words and a major version number and then thrown
 * away; the IP address is never read at all; the referrer is cut down to its
 * domain. See PageView in schema.prisma for the full list of what is kept.
 *
 * Always answers 204 with no body, whatever happened. A beacon has nothing to
 * do with a reply, and a different answer for "rejected" would only tell a
 * spammer which of their attempts to repeat.
 */
export const dynamic = 'force-dynamic';

const done = () => new Response(null, { status: 204 });

const schema = z.object({
  v: z.string().uuid(), // visitor
  s: z.string().uuid(), // session
  p: z.string().max(300), // path
  r: z.string().max(500).optional(), // referrer
});

/** Crawlers are not visitors. Counting them would inflate every figure. */
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|monitor|curl|wget|python|axios|node-fetch/i;

function device(ua: string): string {
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) return 'tablet';
  if (/mobi|iphone|ipod|android/i.test(ua)) return 'mobile';
  return 'desktop';
}

function browser(ua: string): string {
  // Order matters: Edge and Opera also announce Chrome, and Chrome announces
  // Safari.
  if (/edg\//i.test(ua)) return 'edge';
  if (/opr\/|opera/i.test(ua)) return 'opera';
  if (/samsungbrowser/i.test(ua)) return 'samsung';
  if (/chrome|crios/i.test(ua)) return 'chrome';
  if (/firefox|fxios/i.test(ua)) return 'firefox';
  if (/safari/i.test(ua)) return 'safari';
  return 'other';
}

/**
 * The major version, for the family already decided above.
 *
 * Each family announces its own version under a different token, and several
 * announce each other's - a Chrome user agent contains "Safari/537.36", and
 * Edge contains both. So this is keyed on the family rather than trying one
 * pattern against the whole string, which is what would read Edge 152 as
 * Chrome 152.
 *
 * Safari is the odd one: Safari/605.1.15 is the engine build, not the browser,
 * so the number that matters is in Version/17.0. An iOS in-app browser often
 * omits Version entirely, which is why null is an ordinary answer here rather
 * than a failure.
 */
const VERSION: Record<string, RegExp> = {
  edge: /\bedg(?:e|a|ios)?\/(\d{1,3})/i,
  opera: /\b(?:opr|opera)\/(\d{1,3})/i,
  samsung: /\bsamsungbrowser\/(\d{1,3})/i,
  chrome: /\b(?:chrome|crios)\/(\d{1,3})/i,
  firefox: /\b(?:firefox|fxios)\/(\d{1,3})/i,
  safari: /\bversion\/(\d{1,3})/i,
};

function browserVersion(ua: string, family: string): number | null {
  const pattern = VERSION[family];
  if (!pattern) return null;
  const found = pattern.exec(ua);
  if (!found) return null;
  const major = Number.parseInt(found[1], 10);
  // The same range the CHECK constraint enforces, so a strange user agent is
  // dropped here rather than failing the insert and losing the whole view.
  return Number.isInteger(major) && major > 0 && major < 1000 ? major : null;
}

export async function POST(request: Request) {
  const ua = request.headers.get('user-agent') ?? '';
  if (!ua || BOT.test(ua)) return done();

  /**
   * Browsers send Sec-Fetch-Site on every request, including beacons, and
   * page scripts cannot change it. Refusing anything but same-origin stops
   * other websites from pumping visits into the figures from their visitors'
   * browsers. A script outside a browser can still forge it - which is what
   * the per-visitor rate limit below is for.
   */
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return done();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return done();
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return done();
  const { v, s, r } = parsed.data;

  // The path only - never the query string, which can carry email addresses,
  // sign-in tokens or search terms.
  const path = parsed.data.p.split(/[?#]/)[0] || '/';
  if (!path.startsWith('/')) return done();

  // The admin's own browsing would otherwise be the busiest "visitor" there is.
  if (path.startsWith('/admin')) return done();

  let referrerHost: string | null = null;
  if (r) {
    try {
      const host = new URL(r).hostname.replace(/^www\./, '');
      const own = new URL(request.url).hostname.replace(/^www\./, '');
      referrerHost = host && host !== own ? host.slice(0, 120) : null;
    } catch {
      referrerHost = null;
    }
  }

  /**
   * A runaway loop - or someone hammering the endpoint with one id - would
   * otherwise write rows as fast as it can send them. Sixty views a minute is
   * far beyond any person reading a page.
   */
  const recent = await prisma.pageView.count({
    where: { visitorId: v, createdAt: { gte: new Date(Date.now() - 60_000) } },
  });
  if (recent >= 60) return done();

  /**
   * Who is signed in, for attribution ONLY.
   *
   * getSession reads the cookie without asking Supabase to verify it, which
   * would be wrong for deciding access and is fine here: the only thing a
   * forged cookie could achieve is a miscounted "registered visitors" figure.
   * Verifying would mean a network round trip to Supabase on every single
   * page view.
   */
  let customerId: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getSession();
    customerId = data.session?.user.id ?? null;
  } catch {
    customerId = null;
  }

  const family = browser(ua);

  try {
    await prisma.pageView.create({
      data: {
        visitorId: v,
        sessionId: s,
        customerId,
        path: path.slice(0, 300),
        referrerHost,
        device: device(ua),
        browser: family,
        browserVersion: browserVersion(ua, family),
      },
    });
  } catch (err) {
    // Analytics must never break a page. Logged, and the visitor sees nothing.
    console.error(`[track] insert failed: ${(err as Error).message}`);
  }

  return done();
}
