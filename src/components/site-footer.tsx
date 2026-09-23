/**
 * The landing page's footer, rebuilt for the React pages.
 *
 * The shop is static HTML with its own stylesheet; the account pages are
 * Tailwind. They cannot share a stylesheet, so this is the same footer
 * re-expressed in the other system - same maroon ground, same three columns,
 * same links, same wording. The values are copied from the `:root` block in
 * public/landing.html: maroon #5C201D, cream #FBF6EC, gold #BF8F3A.
 *
 * Every in-page link is root-relative (`/#story`, not `#story`) because this
 * renders on /your-account, where a bare hash would look for a section on the
 * account page and do nothing.
 */

const COL_LINK =
  'flex items-center gap-2 text-[0.92rem] text-[#FBF6EC]/78 transition hover:text-[#FBF6EC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#BF8F3A] rounded';

const ICON = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className: 'h-[15px] w-[15px] shrink-0',
  'aria-hidden': true,
};

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-[#5C201D] px-6 pt-16 pb-6 text-[#FBF6EC]/75">
      <div className="mx-auto grid max-w-[1060px] gap-10 md:grid-cols-[1.5fr_1fr_1fr]">
        {/* brand */}
        <div>
          <a
            href="/#top"
            aria-label="Ziventa Gaushala home"
            className="inline-flex items-center gap-[0.55em] rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#BF8F3A]"
          >
            {/*
              On maroon the deep-green disc scores 1.24:1 and all but
              disappears, so the footer uses the light variant: cream disc,
              thin green ring, gold sprout.
            */}
            <span
              aria-hidden="true"
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[#FBF6EC] shadow-[inset_0_0_0_1.5px_#1E4A35]"
            >
              <svg
                viewBox="252.85 -31.71 94 94"
                xmlns="http://www.w3.org/2000/svg"
                className="block h-full w-full fill-[#D9A92B]"
              >
                <path d="M271.46 17.91 C270.77 15.52 270.77 12.99 271.45 10.6 C271.67 9.84 272.3 9.2 273.18 8.98 C275.73 8.34 278.43 8.34 280.98 8.98 C283.44 9.6 285.77 10.82 287.7 12.63 L287.71 12.64 C289.65 14.45 290.95 16.64 291.61 18.95 C292.29 21.33 292.29 23.86 291.61 26.25 C291.4 27.02 290.76 27.66 289.88 27.87 C287.33 28.51 284.64 28.51 282.09 27.87 C279.62 27.25 277.29 26.04 275.36 24.22 L275.35 24.21 C273.42 22.4 272.12 20.22 271.46 17.91 M275.88 13.13 C275.73 14.33 275.83 15.56 276.16 16.73 C276.61 18.29 277.49 19.77 278.79 21 C280.1 22.22 281.68 23.04 283.34 23.46 C284.59 23.78 285.9 23.86 287.18 23.72 C287.33 22.52 287.24 21.3 286.9 20.12 C286.46 18.56 285.58 17.08 284.27 15.86 C282.96 14.63 281.39 13.81 279.72 13.39 C278.47 13.08 277.16 12.99 275.88 13.13" />
                <path d="M323.25 12.85 C322.43 15.71 320.83 18.41 318.44 20.65 L318.43 20.66 C316.05 22.9 313.17 24.4 310.12 25.17 C307.42 25.84 304.59 25.94 301.86 25.47 C301.35 22.91 301.46 20.25 302.18 17.73 C303 14.87 304.6 12.17 306.99 9.92 C309.38 7.68 312.27 6.18 315.32 5.41 C318.01 4.74 320.84 4.63 323.57 5.11 C324.08 7.67 323.97 10.32 323.25 12.85 M327.96 2.62 C327.75 1.86 327.11 1.22 326.24 1 C322.25 0 318.04 0 314.06 1 C310.21 1.97 306.58 3.87 303.56 6.7 L303.55 6.7 C300.53 9.54 298.5 12.94 297.47 16.55 C296.41 20.28 296.41 24.22 297.47 27.95 C297.68 28.72 298.32 29.36 299.19 29.58 C303.18 30.58 307.39 30.58 311.37 29.58 C314.46 28.8 317.41 27.41 320.02 25.43 C320.03 25.42 320.04 25.42 320.05 25.42 C320.39 25.23 321.16 24.53 321.74 24 C321.78 23.96 321.82 23.93 321.87 23.89 C321.85 23.9 321.84 23.91 321.83 23.92 C321.84 23.91 321.85 23.9 321.86 23.89 L321.87 23.89 L321.87 23.88 L321.88 23.88 L321.88 23.87 C321.93 23.82 321.98 23.77 322.03 23.72 C322.26 23.5 322.43 23.34 322.43 23.34 L322.42 23.33 C325.14 20.6 326.99 17.4 327.96 14.03 C329.02 10.3 329.02 6.36 327.96 2.62" />
              </svg>
            </span>
            <span className="font-display text-[1.15rem] leading-tight text-[#FBF6EC]">
              Ziventa
              <em className="-mt-[0.2em] block text-[0.62em] tracking-[0.15em] text-[#BF8F3A] uppercase not-italic">
                Gaushala
              </em>
            </span>
          </a>

          <p className="mt-4 max-w-[320px] text-[0.9rem] text-[#FBF6EC]/65">
            A small, dedicated gaushala raising Gir cows and preparing A2 Bilona ghee and Panchgavya
            products in small batches &mdash; for a limited circle of families who value trust over
            transactions.
          </p>
        </div>

        {/* explore */}
        <div>
          <h2 className="mb-4 text-[0.82rem] tracking-[0.08em] text-[#BF8F3A] uppercase">Explore</h2>
          <div className="flex flex-col gap-[0.7em]">
            <a href="/#story" className={COL_LINK}>
              Our Story
            </a>
            <a href="/#membership" className={COL_LINK}>
              The Gir Gold Club
            </a>
            <a href="/#process" className={COL_LINK}>
              Bilona Process
            </a>
            <a href="/#pricing" className={COL_LINK}>
              Membership
            </a>
          </div>
        </div>

        {/* connect */}
        <div>
          <h2 className="mb-4 text-[0.82rem] tracking-[0.08em] text-[#BF8F3A] uppercase">Connect</h2>
          <div className="flex flex-col gap-[0.7em]">
            <a href="/your-account" className={COL_LINK}>
              <svg {...ICON}>
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              Your Account
            </a>
            <a href="/#join" className={COL_LINK}>
              Pre-Registration
            </a>
            <a
              href="https://instagram.com/ziventagaushala"
              target="_blank"
              rel="noopener noreferrer"
              className={COL_LINK}
            >
              <svg {...ICON}>
                <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
              </svg>
              Instagram
            </a>
            <a href="mailto:hello@ziventagaushala.com" className={COL_LINK}>
              <svg {...ICON}>
                <rect width="20" height="16" x="2" y="4" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
              Contact Us
            </a>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-10 max-w-[1060px] border-t border-white/12 pt-6 text-[0.82rem] text-[#FBF6EC]/55">
        <p>&copy; 2026 Ziventa Gaushala. All rights reserved.</p>
      </div>
    </footer>
  );
}
