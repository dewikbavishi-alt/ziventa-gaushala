'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';

/**
 * Admin navigation.
 *
 * Desktop: a fixed rail that collapses to icons, remembered per browser.
 * Mobile: hidden behind a menu button, opening as a drawer over the page.
 *
 * Links carry the current date range with them, so moving from the dashboard
 * to Orders keeps the same "last 7 days" instead of snapping back to the
 * default. That is what makes the date filter feel global rather than per
 * page.
 */

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: 'home' },
  { href: '/admin/orders', label: 'Orders', icon: 'cart' },
  { href: '/admin/products', label: 'Products', icon: 'box' },
  { href: '/admin/inventory', label: 'Inventory', icon: 'stack' },
  { href: '/admin/customers', label: 'Customers', icon: 'users' },
  { href: '/admin/membership', label: 'Gir Gold Club', icon: 'star' },
  { href: '/admin/analytics', label: 'Analytics', icon: 'chart' },
  { href: '/admin/payments', label: 'Payments', icon: 'card' },
  { href: '/admin/settings', label: 'Settings', icon: 'gear' },
] as const;

type IconName = (typeof NAV)[number]['icon'] | 'logout' | 'menu' | 'close' | 'collapse';

function Icon({ name }: { name: IconName }) {
  const p = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: 'h-5 w-5 shrink-0',
    'aria-hidden': true,
  };
  switch (name) {
    case 'home':
      return <svg {...p}><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>;
    case 'cart':
      return <svg {...p}><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2.5 3h2.6l2.4 12h11l2-8H6.2" /></svg>;
    case 'box':
      return <svg {...p}><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></svg>;
    case 'stack':
      return <svg {...p}><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></svg>;
    case 'users':
      return <svg {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M21.5 20a6.5 6.5 0 0 0-4-6" /></svg>;
    case 'chart':
      return <svg {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>;
    case 'star':
      return <svg {...p}><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" /></svg>;
    case 'card':
      return <svg {...p}><rect x="2.5" y="5" width="19" height="14" rx="2.2" /><path d="M2.5 10h19" /></svg>;
    case 'gear':
      return <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>;
    case 'logout':
      return <svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>;
    case 'menu':
      return <svg {...p}><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
    case 'close':
      return <svg {...p}><path d="M18 6 6 18M6 6l12 12" /></svg>;
    case 'collapse':
      return <svg {...p}><path d="m15 18-6-6 6-6" /></svg>;
  }
}

const COLLAPSE_KEY = 'zv_admin_nav_collapsed';
const COLLAPSE_EVENT = 'zv-admin-nav';

/**
 * The collapsed preference, read as an external store.
 *
 * The server has no localStorage, so it always renders expanded; the browser
 * then reads the saved value. useSyncExternalStore is built for exactly this
 * and, unlike reading storage during render, cannot cause a hydration
 * mismatch.
 */
function subscribe(cb: () => void) {
  window.addEventListener(COLLAPSE_EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(COLLAPSE_EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}
function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    // Stop the page scrolling underneath the open drawer.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  function toggleCollapsed() {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '0' : '1');
    } catch {
      /* storage blocked: the toggle simply will not stick */
    }
    // The 'storage' event only fires in OTHER tabs, so tell this one directly.
    window.dispatchEvent(new Event(COLLAPSE_EVENT));
  }

  const keep = new URLSearchParams();
  for (const k of ['range', 'from', 'to']) {
    const v = params.get(k);
    if (v) keep.set(k, v);
  }
  const qs = keep.toString() ? `?${keep}` : '';

  const isActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);

  const nav = (compact: boolean) => (
    <nav aria-label="Admin" className="flex-1 space-y-1 px-3">
      {NAV.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={`${item.href}${qs}`}
            // Closes the mobile drawer on the way out. Harmless on desktop.
            onClick={() => setOpen(false)}
            aria-current={active ? 'page' : undefined}
            title={compact ? item.label : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
              active
                ? 'bg-a-gold/15 text-a-gold'
                : 'text-a-muted hover:bg-a-raised hover:text-a-text'
            } ${compact ? 'justify-center' : ''}`}
          >
            <Icon name={item.icon} />
            <span className={compact ? 'sr-only' : ''}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  const footer = (compact: boolean) => (
    <div className="border-t border-a-line p-3">
      {!compact && (
        <p className="mb-2 truncate px-3 text-xs text-a-muted" title={email}>
          {email}
        </p>
      )}
      {/* POST, never a link: a GET sign-out can be fired by any prefetch. */}
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          title={compact ? 'Log out' : undefined}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-a-muted transition hover:bg-a-raised hover:text-a-red ${
            compact ? 'justify-center' : ''
          }`}
        >
          <Icon name="logout" />
          <span className={compact ? 'sr-only' : ''}>Log out</span>
        </button>
      </form>
    </div>
  );

  /**
   * The cream logo, because the admin ground is near-black and the logo's own
   * #1c4a23 green disappears against it. Collapsed, the rail is too narrow for
   * a 3.8:1 wordmark, so it falls back to the square icon.
   */
  const brand = (compact: boolean) => (
    <div className={`flex items-center gap-2 px-6 pb-6 pt-7 ${compact ? 'justify-center px-2' : ''}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={compact ? '/logo/ziventa-symbol.svg' : '/logo/ziventa-logo-light.svg'}
        alt="Ziventa"
        width={compact ? 100 : 329}
        height={compact ? 100 : 86}
        className={compact ? 'h-7 w-7' : 'h-6 w-auto'}
      />
      {!compact && <span className="mt-1 text-[10px] uppercase tracking-[0.2em] text-a-gold">Admin</span>}
    </div>
  );

  return (
    <>
      {/* ---- mobile top bar ---- */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-a-line bg-a-bg/95 px-4 py-3 backdrop-blur lg:hidden">
        <span className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo/ziventa-logo-light.svg"
            alt="Ziventa"
            width={329}
            height={86}
            className="h-5 w-auto"
          />
          <span className="text-[10px] uppercase tracking-[0.2em] text-a-gold">Admin</span>
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="admin-drawer"
          className="rounded-lg p-2 text-a-text hover:bg-a-raised"
        >
          <Icon name="menu" />
        </button>
      </div>

      {/* ---- mobile drawer ---- */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
          />
          <aside
            id="admin-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Admin menu"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-a-line bg-a-surface"
          >
            <div className="flex items-start justify-between pr-3">
              {brand(false)}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="mt-6 rounded-lg p-2 text-a-muted hover:bg-a-raised hover:text-a-text"
              >
                <Icon name="close" />
              </button>
            </div>
            {nav(false)}
            {footer(false)}
          </aside>
        </div>
      )}

      {/* ---- desktop rail ---- */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-a-line bg-a-surface transition-[width] duration-200 lg:flex ${
          collapsed ? 'w-20' : 'w-64'
        }`}
      >
        {brand(collapsed)}
        {nav(collapsed)}
        <div className="px-3 pb-2">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
            aria-expanded={!collapsed}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs text-a-muted hover:bg-a-raised hover:text-a-text ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            <span className={`transition-transform ${collapsed ? 'rotate-180' : ''}`}>
              <Icon name="collapse" />
            </span>
            {!collapsed && 'Collapse'}
          </button>
        </div>
        {footer(collapsed)}
      </aside>
    </>
  );
}
