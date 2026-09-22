'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { RANGE_KEYS, RANGE_LABELS, type RangeKey } from '@/lib/admin/range';

/**
 * The global date filter.
 *
 * It only ever changes the URL. Every page reads its range from the URL on
 * the server, so changing it re-runs that page's queries for the new dates -
 * no client-side fetching, no copy of the data in browser state that could
 * drift from the database.
 *
 * Any other filters in the URL (status, search, sort) are kept, but the page
 * number is dropped: page 4 of last month is not a meaningful place to land
 * in last week.
 */
export function RangePicker({
  current,
  from,
  to,
}: {
  current: RangeKey;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [showCustom, setShowCustom] = useState(current === 'custom');
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);

  function go(next: Record<string, string | null>) {
    const q = new URLSearchParams(params.toString());
    q.delete('page');
    for (const [k, v] of Object.entries(next)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    // The default range needs no parameter at all - keeps URLs tidy.
    if (q.get('range') === '30d') q.delete('range');
    const s = q.toString();
    start(() => router.push(s ? `${pathname}?${s}` : pathname, { scroll: false }));
  }

  function onSelect(value: string) {
    if (value === 'custom') {
      setShowCustom(true);
      return;
    }
    setShowCustom(false);
    go({ range: value, from: null, to: null });
  }

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
      <label className="sr-only" htmlFor="range-select">
        Date range
      </label>
      <select
        id="range-select"
        value={showCustom ? 'custom' : current}
        onChange={(e) => onSelect(e.target.value)}
        className="rounded-xl border border-a-line bg-a-surface px-3 py-2 text-sm text-a-text"
      >
        {RANGE_KEYS.map((k) => (
          <option key={k} value={k}>
            {RANGE_LABELS[k]}
          </option>
        ))}
      </select>

      {showCustom && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (f && t) go({ range: 'custom', from: f, to: t });
          }}
        >
          <label className="sr-only" htmlFor="range-from">
            From
          </label>
          <input
            id="range-from"
            type="date"
            value={f}
            max={t || undefined}
            onChange={(e) => setF(e.target.value)}
            className="rounded-xl border border-a-line bg-a-surface px-3 py-1.5 text-sm text-a-text"
          />
          <span className="text-xs text-a-muted" aria-hidden="true">
            to
          </span>
          <label className="sr-only" htmlFor="range-to">
            To
          </label>
          <input
            id="range-to"
            type="date"
            value={t}
            min={f || undefined}
            onChange={(e) => setT(e.target.value)}
            className="rounded-xl border border-a-line bg-a-surface px-3 py-1.5 text-sm text-a-text"
          />
          <button
            type="submit"
            disabled={!f || !t}
            className="rounded-xl bg-a-gold px-3 py-1.5 text-sm font-medium text-a-bg disabled:opacity-40"
          >
            Apply
          </button>
        </form>
      )}

      {pending && (
        <span className="text-xs text-a-muted" role="status">
          Updating&hellip;
        </span>
      )}
    </div>
  );
}
