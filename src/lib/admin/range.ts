/**
 * Date ranges for the admin dashboard, in India time.
 *
 * Every boundary here is an IST boundary. The database stores UTC, so a
 * naive "since midnight" would mean since 05:30 IST - and every order placed
 * after 18:30 IST would land on the NEXT day's bar. For a shop whose
 * customers are all in India that is simply wrong, so days, weeks and months
 * are cut at IST midnight and converted back to UTC instants for querying.
 *
 * IST has no daylight saving, so a fixed +05:30 offset is exact all year.
 */

export const IST_OFFSET_MS = 330 * 60 * 1000;

export type Bucket = 'hour' | 'day' | 'week' | 'month';

export const RANGE_KEYS = [
  'today',
  'yesterday',
  '7d',
  '30d',
  'this-month',
  'last-month',
  '90d',
  '180d',
  '12m',
  'this-year',
  'custom',
] as const;

export type RangeKey = (typeof RANGE_KEYS)[number];

export const RANGE_LABELS: Record<RangeKey, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  'this-month': 'This month',
  'last-month': 'Last month',
  '90d': 'Last 3 months',
  '180d': 'Last 6 months',
  '12m': 'Last 12 months',
  'this-year': 'This year',
  custom: 'Custom range',
};

export interface DateRange {
  key: RangeKey;
  label: string;
  /** Inclusive, as a UTC instant. */
  start: Date;
  /** Exclusive, as a UTC instant. */
  end: Date;
  /** The same length of time immediately before, for "vs previous" figures. */
  prevStart: Date;
  prevEnd: Date;
  bucket: Bucket;
  /** YYYY-MM-DD in IST, for the custom-range inputs. */
  fromInput: string;
  toInput: string;
}

// ---------------------------------------------------------------- IST maths

/** Year, month and day of an instant, as seen on a clock in India. */
function istParts(t: Date) {
  const s = new Date(t.getTime() + IST_OFFSET_MS);
  return { y: s.getUTCFullYear(), m: s.getUTCMonth(), d: s.getUTCDate(), h: s.getUTCHours() };
}

/** The UTC instant of a given IST wall-clock time. Out-of-range days roll over. */
function istInstant(y: number, m: number, d: number, h = 0): Date {
  return new Date(Date.UTC(y, m, d, h) - IST_OFFSET_MS);
}

export function startOfIstDay(t: Date): Date {
  const { y, m, d } = istParts(t);
  return istInstant(y, m, d);
}

export function startOfIstYear(t: Date): Date {
  return istInstant(istParts(t).y, 0, 1);
}

/** YYYY-MM-DD for an instant, in IST. */
export function istDateString(t: Date): string {
  const { y, m, d } = istParts(t);
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Truncate to the start of its bucket, in IST - matching Postgres date_trunc. */
export function truncIst(t: Date, bucket: Bucket): Date {
  const { y, m, d, h } = istParts(t);
  switch (bucket) {
    case 'hour':
      return istInstant(y, m, d, h);
    case 'day':
      return istInstant(y, m, d);
    case 'week': {
      // date_trunc('week') starts on Monday. getUTCDay on the IST-shifted
      // date is the IST weekday: 0 = Sunday.
      const wd = new Date(Date.UTC(y, m, d)).getUTCDay();
      const back = (wd + 6) % 7;
      return istInstant(y, m, d - back);
    }
    case 'month':
      return istInstant(y, m, 1);
  }
}

export function stepIst(t: Date, bucket: Bucket): Date {
  const { y, m, d, h } = istParts(t);
  switch (bucket) {
    case 'hour':
      return istInstant(y, m, d, h + 1);
    case 'day':
      return istInstant(y, m, d + 1);
    case 'week':
      return istInstant(y, m, d + 7);
    case 'month':
      return istInstant(y, m + 1, 1);
  }
}

/**
 * The key Postgres produces for a bucket, so JS and SQL agree on it.
 * Matches to_char(..., 'YYYY-MM-DD"T"HH24') in queries.ts.
 */
export function bucketKey(t: Date): string {
  const { h } = istParts(t);
  return `${istDateString(t)}T${String(h).padStart(2, '0')}`;
}

/** Every bucket start from start up to end, so empty periods still get a bar. */
export function bucketStarts(start: Date, end: Date, bucket: Bucket): Date[] {
  const out: Date[] = [];
  // Hard cap: a malformed range must never generate a million buckets.
  for (let t = truncIst(start, bucket); t < end && out.length < 400; t = stepIst(t, bucket)) {
    out.push(t);
  }
  return out;
}

// ------------------------------------------------------------ range parsing

const DAY_MS = 86_400_000;

function bucketFor(ms: number): Bucket {
  if (ms <= 2 * DAY_MS) return 'hour';
  if (ms <= 62 * DAY_MS) return 'day';
  if (ms <= 190 * DAY_MS) return 'week';
  return 'month';
}

/** Parse YYYY-MM-DD as an IST calendar date. Anything else is null. */
function parseIstDate(v: string | undefined): Date | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split('-').map(Number);
  const t = istInstant(y, m - 1, d);
  // Reject rollovers such as 2026-02-31, which Date.UTC would quietly accept.
  return istDateString(t) === v ? t : null;
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Turn the URL's search params into a concrete range.
 *
 * The range lives in the URL rather than in component state, so a filtered
 * view can be bookmarked, shared, and survives a refresh - and every page
 * reads the same one, which is what makes the date filter global.
 *
 * Anything unrecognised falls back to the last 30 days rather than erroring.
 */
export function parseRange(
  params: Record<string, string | string[] | undefined>,
  now: Date = new Date(),
): DateRange {
  const raw = first(params.range);
  const key: RangeKey = (RANGE_KEYS as readonly string[]).includes(raw ?? '')
    ? (raw as RangeKey)
    : '30d';

  const today = startOfIstDay(now);
  const tomorrow = stepIst(today, 'day');
  const { y, m } = istParts(now);

  let start: Date;
  let end: Date = tomorrow;

  switch (key) {
    case 'today':
      start = today;
      break;
    case 'yesterday':
      start = new Date(today.getTime() - DAY_MS);
      end = today;
      break;
    case '7d':
      start = new Date(tomorrow.getTime() - 7 * DAY_MS);
      break;
    case '30d':
      start = new Date(tomorrow.getTime() - 30 * DAY_MS);
      break;
    case '90d':
      start = new Date(tomorrow.getTime() - 90 * DAY_MS);
      break;
    case '180d':
      start = new Date(tomorrow.getTime() - 180 * DAY_MS);
      break;
    case '12m':
      start = istInstant(y - 1, m + 1, 1);
      break;
    case 'this-month':
      start = istInstant(y, m, 1);
      break;
    case 'last-month':
      start = istInstant(y, m - 1, 1);
      end = istInstant(y, m, 1);
      break;
    case 'this-year':
      start = istInstant(y, 0, 1);
      break;
    case 'custom': {
      let from = parseIstDate(first(params.from));
      let to = parseIstDate(first(params.to));
      if (!from || !to) {
        // Half-filled custom range: behave like the default rather than fail.
        from = new Date(tomorrow.getTime() - 30 * DAY_MS);
        to = today;
      }
      if (from > to) [from, to] = [to, from];
      start = from;
      end = stepIst(to, 'day'); // make the chosen end day inclusive
      // Capped at three years - long enough for any real question, short
      // enough that a typo cannot ask the database to scan everything.
      const maxSpan = 3 * 366 * DAY_MS;
      if (end.getTime() - start.getTime() > maxSpan) {
        start = new Date(end.getTime() - maxSpan);
      }
      break;
    }
  }

  const span = end.getTime() - start.getTime();

  return {
    key,
    label:
      key === 'custom'
        ? `${istDateString(start)} to ${istDateString(new Date(end.getTime() - 1))}`
        : RANGE_LABELS[key],
    start,
    end,
    prevStart: new Date(start.getTime() - span),
    prevEnd: start,
    bucket: bucketFor(span),
    fromInput: istDateString(start),
    toInput: istDateString(new Date(end.getTime() - 1)),
  };
}

/** Query string that preserves the chosen range when moving between pages. */
export function rangeQuery(r: DateRange): string {
  if (r.key === 'custom') return `range=custom&from=${r.fromInput}&to=${r.toInput}`;
  return r.key === '30d' ? '' : `range=${r.key}`;
}
