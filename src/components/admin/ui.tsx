import Link from 'next/link';
import type { Tone } from '@/lib/admin/status';

/**
 * The admin's building blocks. Server components - no state, no JavaScript
 * sent to the browser for any of them.
 */

export function Card({
  title,
  action,
  children,
  className = '',
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-a-line bg-a-surface p-4 sm:p-5 ${className}`}
    >
      {(title || action) && (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="font-display text-lg text-a-text">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export const TONE_TEXT: Record<Tone, string> = {
  green: 'text-a-green',
  amber: 'text-a-amber',
  blue: 'text-a-blue',
  violet: 'text-a-violet',
  red: 'text-a-red',
  grey: 'text-a-muted',
  orange: 'text-a-orange',
};

const TONE_BG: Record<Tone, string> = {
  green: 'bg-a-green/15 text-a-green ring-a-green/25',
  amber: 'bg-a-amber/15 text-a-amber ring-a-amber/25',
  blue: 'bg-a-blue/15 text-a-blue ring-a-blue/25',
  violet: 'bg-a-violet/15 text-a-violet ring-a-violet/25',
  red: 'bg-a-red/15 text-a-red ring-a-red/25',
  grey: 'bg-a-muted/15 text-a-muted ring-a-muted/25',
  orange: 'bg-a-orange/15 text-a-orange ring-a-orange/25',
};

export const TONE_HEX: Record<Tone, string> = {
  green: '#6fa982',
  amber: '#d9a441',
  blue: '#6e9fd1',
  violet: '#9a86c8',
  red: '#d46a5b',
  grey: '#8e998f',
  orange: '#d88a4e',
};

export function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE_BG[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * Up/down against the previous period. Colour follows whether the change is
 * GOOD, not its sign - more cancellations is up and red.
 */
export function Change({
  value,
  invert = false,
}: {
  value: number | null;
  invert?: boolean;
}) {
  if (value == null) {
    return <span className="text-xs text-a-muted">no earlier data</span>;
  }
  const up = value >= 0;
  const good = invert ? !up : up;
  return (
    <span className={`text-xs font-medium ${good ? 'text-a-green' : 'text-a-red'}`}>
      <span aria-hidden="true">{up ? '↑' : '↓'}</span>{' '}
      {Math.abs(value).toFixed(1)}%
      <span className="sr-only"> {up ? 'up' : 'down'} on the previous period</span>
    </span>
  );
}

export function StatCard({
  label,
  value,
  change,
  invertChange,
  hint,
  icon,
  tone = 'gold',
  href,
}: {
  label: string;
  value: React.ReactNode;
  change?: number | null;
  invertChange?: boolean;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: Tone | 'gold';
  href?: string;
}) {
  const iconColour = tone === 'gold' ? 'text-a-gold bg-a-gold/15' : TONE_BG[tone];
  const body = (
    <div className="flex h-full items-start justify-between gap-3 rounded-2xl border border-a-line bg-a-surface p-4 transition hover:border-a-gold/30">
      <div className="min-w-0">
        <p className="truncate text-sm text-a-muted">{label}</p>
        <p className="mt-1 truncate font-display text-2xl text-a-text">{value}</p>
        <div className="mt-1.5 min-h-4">
          {change !== undefined ? <Change value={change} invert={invertChange} /> : hint}
        </div>
      </div>
      {icon && (
        <span
          aria-hidden="true"
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconColour}`}
        >
          {icon}
        </span>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-2xl">
      {body}
    </Link>
  ) : (
    body
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-a-line px-4 py-10 text-center">
      <p className="text-sm text-a-text">{title}</p>
      {children && <div className="mt-1 text-xs text-a-muted">{children}</div>}
    </div>
  );
}

/** Wide tables scroll sideways inside their card instead of stretching the page. */
export function TableWrap({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div
      className="-mx-4 overflow-x-auto sm:-mx-5"
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export const th = 'px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-a-muted sm:px-5';
export const td = 'border-t border-a-line px-4 py-3 align-middle sm:px-5';

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl text-a-text sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-a-muted">{description}</p>}
      </div>
      {children}
    </div>
  );
}

/** Previous / next with the rest of the query string kept intact. */
export function Pager({
  page,
  pages,
  href,
}: {
  page: number;
  pages: number;
  href: (page: number) => string;
}) {
  if (pages <= 1) return null;
  const btn =
    'rounded-lg border border-a-line px-3 py-1.5 text-sm transition hover:border-a-gold/40';
  return (
    <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Pagination">
      {page > 1 ? (
        <Link href={href(page - 1)} className={btn}>
          Previous
        </Link>
      ) : (
        <span className={`${btn} opacity-40`} aria-disabled="true">
          Previous
        </span>
      )}
      <span className="text-xs text-a-muted">
        Page {page} of {pages}
      </span>
      {page < pages ? (
        <Link href={href(page + 1)} className={btn}>
          Next
        </Link>
      ) : (
        <span className={`${btn} opacity-40`} aria-disabled="true">
          Next
        </span>
      )}
    </nav>
  );
}

/** A small labelled list of figures, e.g. a revenue breakdown. */
export function Breakdown({
  rows,
}: {
  rows: { label: string; value: React.ReactNode; tone?: Tone; strong?: boolean }[];
}) {
  return (
    <dl className="divide-y divide-a-line">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-3 py-2.5">
          <dt className={`text-sm ${r.strong ? 'font-medium text-a-text' : 'text-a-muted'}`}>
            {r.tone && (
              <span
                aria-hidden="true"
                className="mr-2 inline-block h-2 w-2 rounded-full"
                style={{ background: TONE_HEX[r.tone] }}
              />
            )}
            {r.label}
          </dt>
          <dd className={`text-sm tabular-nums ${r.strong ? 'font-semibold text-a-text' : 'text-a-text'}`}>
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
