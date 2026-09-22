'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Sends one page view per route to /api/track.
 *
 * The landing page is plain HTML and carries its own copy of this logic; this
 * covers the Next.js pages - sign-in, sign-up, the account section. Both use
 * the same storage keys, so a visitor keeps one id across the two.
 *
 * Skipped entirely when the browser signals Global Privacy Control or Do Not
 * Track. Nothing here is personal data, but honouring the request costs one
 * line and a slightly lower number.
 *
 * sendBeacon rather than fetch: it survives the page being closed or
 * navigated away from, and never holds anything up.
 */

const VISITOR = 'zv_vid';
const SESSION = 'zv_sid';
const SEEN = 'zv_seen';
/** A new visit starts after this long without a page view. */
const SESSION_GAP_MS = 30 * 60 * 1000;

function uuid(): string {
  // Typed as optional: the DOM types assume randomUUID always exists, which
  // would make the fallback below look unreachable - but Safari before 15.4
  // does not have it.
  const c = globalThis.crypto as Crypto & { randomUUID?: () => string };
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  // Older browsers: RFC 4122 v4 from getRandomValues.
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function optedOut(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.globalPrivacyControl === true || navigator.doNotTrack === '1';
}

export function VisitorTracker() {
  const pathname = usePathname();

  useEffect(() => {
    // The admin's own browsing would otherwise swamp the figures.
    if (!pathname || pathname.startsWith('/admin')) return;

    try {
      if (optedOut()) return;

      let visitor = localStorage.getItem(VISITOR);
      if (!visitor) {
        visitor = uuid();
        localStorage.setItem(VISITOR, visitor);
      }

      const now = Date.now();
      const last = Number(localStorage.getItem(SEEN)) || 0;
      let session = localStorage.getItem(SESSION);
      if (!session || now - last > SESSION_GAP_MS) {
        session = uuid();
        localStorage.setItem(SESSION, session);
      }
      localStorage.setItem(SEEN, String(now));

      const body = JSON.stringify({ v: visitor, s: session, p: pathname, r: document.referrer });
      const blob = new Blob([body], { type: 'application/json' });
      if (!navigator.sendBeacon?.('/api/track', blob)) {
        void fetch('/api/track', {
          method: 'POST',
          body,
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } catch {
      // Private mode, storage disabled, or blocked - analytics are optional.
    }
  }, [pathname]);

  return null;
}
