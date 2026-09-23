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
            className="inline-flex items-center gap-[0.52em] rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#BF8F3A]"
          >
            {/*
              Symbol plus wordmark, served from /logo as plain <img> tags so
              there is one copy of each shared with the static landing page.

              Both are the cream variants: the logo's own #1c4a23 green scores
              about 1.2:1 on this maroon and would all but vanish. The symbol
              is alt="" because it is decorative - the wordmark beside it
              already names the brand, and the link has its own label.

              width/height are the artwork's proportions, so the row does not
              reflow once the SVGs arrive.
            */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo/ziventa-symbol-light.svg"
              alt=""
              width={100}
              height={100}
              className="block h-11 w-11 shrink-0"
            />
            <span className="inline-flex flex-col items-center gap-[0.14em]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo/ziventa-logo-light.svg"
                alt="Ziventa"
                width={329}
                height={86}
                className="block h-[30px] w-auto"
              />
              <span className="-mr-[0.42em] text-[0.56rem] font-semibold tracking-[0.42em] text-[#BF8F3A] uppercase">
                Gaushala
              </span>
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
