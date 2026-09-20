import Link from 'next/link';

/**
 * One tile in the account hub: icon, title, one line saying what it is for.
 *
 * The whole card is the link rather than a "view" button inside it, so the
 * target is the full tile on a phone instead of a few words of text.
 *
 * `external` switches to a plain anchor - Link is for in-app navigation and
 * would do nothing useful for a mailto.
 */
export function AccountCard({
  href,
  title,
  description,
  icon,
  external = false,
  badge,
}: {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  external?: boolean;
  /** Small status word, e.g. a seat number or an order count. */
  badge?: string;
}) {
  const className =
    'group flex items-start gap-4 rounded-2xl border border-[#2F4A3D]/12 bg-white p-5 transition hover:border-[#C08A2E]/50 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E4A35]';

  const body = (
    <>
      <span
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-[#C08A2E] transition group-hover:text-[#1E4A35]"
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-[#2F4A3D]">{title}</span>
          {badge && (
            <span className="rounded bg-[#1E4A35]/10 px-2 py-0.5 text-xs font-medium text-[#1E4A35]">
              {badge}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-sm text-[#2F4A3D]/70">{description}</span>
      </span>
    </>
  );

  if (external) {
    return (
      <a href={href} className={className}>
        {body}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {body}
    </Link>
  );
}

/**
 * Icons as inline SVG.
 *
 * The landing page loads Lucide from a CDN, but pulling an icon package in
 * here for six glyphs would add a dependency and a bundle for no gain. Each
 * is aria-hidden - the card's own text is the accessible name, and a second
 * label would just make a screen reader say everything twice.
 */
const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className: 'h-7 w-7',
};

export const OrdersIcon = () => (
  <svg {...iconProps}>
    <path d="M21 8V7l-9-4-9 4v10l9 4 9-4v-1" />
    <path d="M3.3 7L12 11l8.7-4M12 11v10" />
  </svg>
);

export const SecurityIcon = () => (
  <svg {...iconProps}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20a6.2 6.2 0 0 1 10-4.6" />
    <rect x="15" y="14" width="6.5" height="6" rx="1.2" />
    <path d="M16.6 14v-1.6a1.9 1.9 0 0 1 3.8 0V14" />
  </svg>
);

export const MembershipIcon = () => (
  <svg {...iconProps}>
    <rect x="2.5" y="5" width="19" height="14" rx="2.2" />
    <path d="M2.5 10h19M6.5 14.5h5" />
  </svg>
);

export const AddressIcon = () => (
  <svg {...iconProps}>
    <path d="M20.5 3.5L3.5 10.2l7.2 2.9 2.9 7.4z" />
  </svg>
);

export const ContactIcon = () => (
  <svg {...iconProps}>
    <path d="M4 11a8 8 0 0 1 16 0" />
    <rect x="2.5" y="11" width="4.5" height="6.5" rx="1.6" />
    <rect x="17" y="11" width="4.5" height="6.5" rx="1.6" />
    <path d="M20 17.5a3 3 0 0 1-3 3h-2.5" />
  </svg>
);
