import Link from 'next/link';
import { SiteFooter } from '@/components/site-footer';

/**
 * The frame every account page sits in.
 *
 * Holds the title, the Log Out button and - on sub-pages - the way back, so
 * no individual page re-invents the header and they cannot drift apart.
 *
 * Deliberately not a sidebar. The reference uses a card grid as the hub and
 * full-width pages beneath it, which suits a site with five account sections
 * far better than a permanent nav rail: on a phone a sidebar becomes either a
 * hamburger nobody opens or a stack of links pushing the content off screen.
 *
 * The site footer is part of the frame rather than of each page, so the
 * account section cannot end up with it on some pages and not others. The
 * outer element is a flex column with a growing main, which holds the footer
 * at the bottom of the window on a short page instead of leaving it floating
 * halfway up with cream underneath.
 */
export function AccountShell({
  title,
  description,
  backHref,
  backLabel,
  hero,
  children,
}: {
  title: string;
  description?: string;
  /** Omit on the hub itself. */
  backHref?: string;
  backLabel?: string;
  /** Optional band between the header and the body, used by the hub. */
  hero?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[#FBF6EC]">
      <main className="flex-1 px-4 py-8 sm:py-10">
        <div className="mx-auto max-w-5xl">
          {backHref && (
            <Link
              href={backHref}
              className="group mb-4 inline-flex items-center gap-1.5 rounded text-sm text-[#2F4A3D]/70 underline-offset-4 transition hover:text-[#2F4A3D] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E4A35]"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4 transition-transform group-hover:-translate-x-0.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              {backLabel ?? 'Back'}
            </Link>
          )}

          <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl text-[#2F4A3D] sm:text-3xl">{title}</h1>
              {description && <p className="mt-1 text-sm text-[#2F4A3D]/70">{description}</p>}
            </div>

            {/*
              POST, not a link. A GET sign-out can be triggered by any image or
              prefetch on the page, logging someone out without them asking.
            */}
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-lg bg-[#C08A2E] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#a97724] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E4A35]"
              >
                Log Out
              </button>
            </form>
          </header>

          {hero}

          {children}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
