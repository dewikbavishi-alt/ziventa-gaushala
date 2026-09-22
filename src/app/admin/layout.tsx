import { Suspense } from 'react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAdminUser } from '@/lib/admin';
import { getCurrentUser } from '@/lib/supabase/server';
import { safeNext } from '@/lib/safe-next';
import { Sidebar } from '@/components/admin/sidebar';

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s | Ziventa Admin' },
  // Admin pages must never appear in a search engine, whatever else happens.
  robots: { index: false, follow: false },
};

/** Every admin page is per-request: live figures, and never cached. */
export const dynamic = 'force-dynamic';

/**
 * The gate for everything under /admin.
 *
 * Signed out: sent to sign in, and brought back to the page they asked for.
 * Signed in but not an admin: told so, plainly, with nothing else rendered.
 *
 * This is not the only check. Pages render in parallel with this layout, so
 * each one also calls getAdminUser() before touching the database, and every
 * Server Action calls requireAdmin() - a direct POST never passes through
 * this file at all.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdminUser();

  if (!admin) {
    const user = await getCurrentUser();
    if (!user) {
      const path = (await headers()).get('x-pathname');
      redirect(`/login?next=${encodeURIComponent(safeNext(path ?? '/admin'))}`);
    }

    return (
      <div data-admin className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md rounded-2xl border border-a-line bg-a-surface p-8 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-a-gold">403</p>
          <h1 className="mt-2 font-display text-2xl">Owner only</h1>
          <p className="mt-3 text-sm text-a-muted">
            You are signed in as <strong className="text-a-text">{user.email}</strong>. This dashboard
            belongs to the shop owner and cannot be opened by any other account.
          </p>
          <form action="/auth/signout" method="post" className="mt-6">
            <button className="rounded-xl border border-a-line px-4 py-2 text-sm hover:border-a-gold/40">
              Sign out
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div data-admin className="min-h-screen lg:flex">
      {/* useSearchParams in the sidebar needs a Suspense boundary. */}
      <Suspense fallback={<div className="hidden w-64 shrink-0 lg:block" />}>
        <Sidebar email={admin.email ?? ''} />
      </Suspense>
      <main id="admin-main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {children}
      </main>
    </div>
  );
}
