import type { Bucket } from '@/lib/admin/range';
import type { SeriesPoint } from '@/lib/admin/queries';
import { TONE_HEX } from './ui';
import type { Tone } from '@/lib/admin/status';

/**
 * Charts, drawn as SVG on the server.
 *
 * No charting library: the dashboard needs lines, bars and a ring, and a
 * library would be roughly 100KB of JavaScript to draw them. These render to
 * plain markup, so they appear with the page instead of popping in after
 * hydration.
 *
 * The shapes stretch to fit (preserveAspectRatio none, non-scaling strokes),
 * while every label is HTML - so text stays crisp at any width instead of
 * squashing with the drawing.
 *
 * Each chart also renders its numbers as a visually hidden table. A chart is
 * only a picture to a screen reader; the table is what makes it data.
 */

const W = 1000;
const H = 300;

/** Round a maximum up to something a person would put on an axis. */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(v));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

function tickLabel(at: Date, bucket: Bucket): string {
  const opts: Intl.DateTimeFormatOptions =
    bucket === 'hour'
      ? { hour: 'numeric', hour12: true }
      : bucket === 'month'
        ? { month: 'short', year: '2-digit' }
        : { day: 'numeric', month: 'short' };
  return new Intl.DateTimeFormat('en-IN', { ...opts, timeZone: 'Asia/Kolkata' }).format(at);
}

/** About five evenly spaced labels, always including the last. */
function tickIndexes(len: number, want = 5): number[] {
  if (len <= want) return [...Array(len).keys()];
  const step = (len - 1) / (want - 1);
  return [...new Set([...Array(want)].map((_, i) => Math.round(i * step)))];
}

function Axis({
  max,
  format,
}: {
  max: number;
  format: (v: number) => string;
}) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 left-0 flex w-14 flex-col justify-between text-right text-[10px] text-a-muted"
    >
      {[4, 3, 2, 1, 0].map((i) => (
        <span key={i} className="-translate-y-1/2 pr-2 first:translate-y-0 last:translate-y-0">
          {format((max / 4) * i)}
        </span>
      ))}
    </div>
  );
}

function XLabels({ points, bucket }: { points: SeriesPoint[]; bucket: Bucket }) {
  const idx = tickIndexes(points.length);
  return (
    <div aria-hidden="true" className="relative mt-2 ml-14 h-4 text-[10px] text-a-muted">
      {idx.map((i) => (
        <span
          key={i}
          className="absolute -translate-x-1/2 whitespace-nowrap first:translate-x-0 last:-translate-x-full"
          style={{ left: points.length > 1 ? `${(i / (points.length - 1)) * 100}%` : '50%' }}
        >
          {tickLabel(points[i].at, bucket)}
        </span>
      ))}
    </div>
  );
}

function Grid() {
  return (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
        <line
          key={i}
          x1="0"
          x2={W}
          y1={(H / 4) * i}
          y2={(H / 4) * i}
          stroke="rgb(237 230 214 / 0.07)"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </>
  );
}

function SrTable({
  caption,
  points,
  bucket,
  format,
  label,
  label2,
  format2,
}: {
  caption: string;
  points: SeriesPoint[];
  bucket: Bucket;
  format: (v: number) => string;
  label: string;
  label2?: string;
  format2?: (v: number) => string;
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Period</th>
          <th scope="col">{label}</th>
          {label2 && <th scope="col">{label2}</th>}
        </tr>
      </thead>
      <tbody>
        {points.map((p) => (
          <tr key={p.key}>
            <th scope="row">{tickLabel(p.at, bucket)}</th>
            <td>{format(p.value)}</td>
            {label2 && <td>{(format2 ?? format)(p.value2 ?? 0)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ------------------------------------------------------------------ area

export function AreaChart({
  points,
  bucket,
  format,
  tone = 'gold',
  caption,
  valueLabel,
  height = 200,
}: {
  points: SeriesPoint[];
  bucket: Bucket;
  format: (v: number) => string;
  tone?: Tone | 'gold';
  caption: string;
  valueLabel: string;
  height?: number;
}) {
  const colour = tone === 'gold' ? '#d2a04a' : TONE_HEX[tone];
  const max = niceMax(Math.max(0, ...points.map((p) => p.value)));
  const x = (i: number) => (points.length > 1 ? (i / (points.length - 1)) * W : W / 2);
  const y = (v: number) => H - (v / max) * H;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = points.length ? `${line} L${x(points.length - 1)},${H} L${x(0)},${H} Z` : '';
  const gid = `g-${caption.replace(/\W+/g, '')}`;

  return (
    <figure>
      <div className="relative pl-14" style={{ height }}>
        <Axis max={max} format={format} />
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-full w-full overflow-visible"
          role="img"
          aria-label={caption}
        >
          <defs>
            <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={colour} stopOpacity="0.35" />
              <stop offset="100%" stopColor={colour} stopOpacity="0" />
            </linearGradient>
          </defs>
          <Grid />
          {area && <path d={area} fill={`url(#${gid})`} />}
          {line && (
            <path d={line} fill="none" stroke={colour} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          )}
          {/* Invisible wide hit areas carry the hover tooltip for each point. */}
          {points.map((p, i) => (
            <rect
              key={p.key}
              x={x(i) - W / Math.max(points.length, 1) / 2}
              y="0"
              width={W / Math.max(points.length, 1)}
              height={H}
              fill="transparent"
            >
              <title>{`${tickLabel(p.at, bucket)}: ${format(p.value)}`}</title>
            </rect>
          ))}
        </svg>
      </div>
      <XLabels points={points} bucket={bucket} />
      <SrTable caption={caption} points={points} bucket={bucket} format={format} label={valueLabel} />
    </figure>
  );
}

// ------------------------------------------------------------------ bars

export function BarChart({
  points,
  bucket,
  format,
  caption,
  valueLabel,
  value2Label,
  tone = 'gold',
  tone2 = 'green',
  height = 200,
}: {
  points: SeriesPoint[];
  bucket: Bucket;
  format: (v: number) => string;
  caption: string;
  valueLabel: string;
  /** When set, draws a second bar per period from value2. */
  value2Label?: string;
  tone?: Tone | 'gold';
  tone2?: Tone;
  height?: number;
}) {
  const c1 = tone === 'gold' ? '#d2a04a' : TONE_HEX[tone];
  const c2 = TONE_HEX[tone2];
  const pair = Boolean(value2Label);
  const max = niceMax(
    Math.max(0, ...points.map((p) => Math.max(p.value, pair ? (p.value2 ?? 0) : 0))),
  );
  const slot = W / Math.max(points.length, 1);
  const barW = Math.max(2, slot * (pair ? 0.34 : 0.62));
  const h = (v: number) => (v / max) * H;

  return (
    <figure>
      {pair && (
        <div className="mb-2 flex justify-end gap-4 text-xs text-a-muted" aria-hidden="true">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: c1 }} />
            {valueLabel}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: c2 }} />
            {value2Label}
          </span>
        </div>
      )}
      <div className="relative pl-14" style={{ height }}>
        <Axis max={max} format={format} />
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-full w-full"
          role="img"
          aria-label={caption}
        >
          <Grid />
          {points.map((p, i) => {
            const cx = slot * i + slot / 2;
            const x1 = pair ? cx - barW - 1 : cx - barW / 2;
            return (
              <g key={p.key}>
                <title>
                  {`${tickLabel(p.at, bucket)}: ${valueLabel} ${format(p.value)}${
                    pair ? `, ${value2Label} ${format(p.value2 ?? 0)}` : ''
                  }`}
                </title>
                <rect x={x1} y={H - h(p.value)} width={barW} height={h(p.value)} rx="2" fill={c1} />
                {pair && (
                  <rect
                    x={cx + 1}
                    y={H - h(p.value2 ?? 0)}
                    width={barW}
                    height={h(p.value2 ?? 0)}
                    rx="2"
                    fill={c2}
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <XLabels points={points} bucket={bucket} />
      <SrTable
        caption={caption}
        points={points}
        bucket={bucket}
        format={format}
        label={valueLabel}
        label2={value2Label}
      />
    </figure>
  );
}

// ------------------------------------------------------------------ donut

export function DonutChart({
  segments,
  centerValue,
  centerLabel,
  caption,
  format = (v) => String(v),
}: {
  segments: { label: string; value: number; tone: Tone }[];
  centerValue: string;
  centerLabel: string;
  caption: string;
  format?: (v: number) => string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = 42;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <figure className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <div className="relative h-40 w-40 shrink-0">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" role="img" aria-label={caption}>
          <circle cx="50" cy="50" r={r} fill="none" stroke="rgb(237 230 214 / 0.07)" strokeWidth="12" />
          {total > 0 &&
            segments
              .filter((s) => s.value > 0)
              .map((s) => {
                const len = (s.value / total) * circ;
                const el = (
                  <circle
                    key={s.label}
                    cx="50"
                    cy="50"
                    r={r}
                    fill="none"
                    stroke={TONE_HEX[s.tone]}
                    strokeWidth="12"
                    strokeDasharray={`${len} ${circ - len}`}
                    strokeDashoffset={-offset}
                  >
                    <title>{`${s.label}: ${format(s.value)} (${((s.value / total) * 100).toFixed(1)}%)`}</title>
                  </circle>
                );
                offset += len;
                return el;
              })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="font-display text-xl text-a-text">{centerValue}</span>
          <span className="text-[11px] text-a-muted">{centerLabel}</span>
        </div>
      </div>

      <ul className="w-full min-w-0 space-y-2 text-sm">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: TONE_HEX[s.tone] }}
            />
            <span className="min-w-0 flex-1 truncate text-a-muted">{s.label}</span>
            <span className="w-12 text-right tabular-nums text-a-muted">
              {total ? `${((s.value / total) * 100).toFixed(0)}%` : '0%'}
            </span>
            <span className="w-16 text-right tabular-nums text-a-text">{format(s.value)}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
