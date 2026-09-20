import Link from 'next/link';

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
 */
export function AccountShell({
  title,
  description,
  backHref,
  backLabel,
  children,
}: {
  title: string;
  description?: string;
  /** Omit on the hub itself. */
  backHref?: string;
  backLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#FBF6EC] px-4 py-8 sm:py-10">
      <div className="mx-auto max-w-5xl">
        {backHref && (
          <Link
            href={backHref}
            className="mb-4 inline-flex items-center gap-1.5 rounded text-sm text-[#2F4A3D]/70 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E4A35]"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-4 w-4"
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

        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-[#2F4A3D] sm:text-3xl">{title}</h1>
            {description && (
              <p className="mt-1 text-sm text-[#2F4A3D]/70">{description}</p>
            )}
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

        {children}
      </div>
    </main>
  );
}
