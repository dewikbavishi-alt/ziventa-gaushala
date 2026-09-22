/**
 * Checks the IST date maths the whole dashboard is built on.
 *
 *   npm run test:range
 *
 * These are the cases that go wrong silently: an order at 11pm India time
 * landing on tomorrow, a week starting on Sunday, February 31st being
 * accepted.
 */
import {
  bucketKey,
  bucketStarts,
  istDateString,
  parseRange,
  startOfIstDay,
  truncIst,
} from '../src/lib/admin/range';

let failures = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `  got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
}

// 22 Sep 2026, 23:30 IST  ==  22 Sep 2026, 18:00 UTC
const lateEvening = new Date('2026-09-22T18:00:00Z');
// 23 Sep 2026, 00:30 IST  ==  22 Sep 2026, 19:00 UTC
const justAfterMidnight = new Date('2026-09-22T19:00:00Z');

console.log('IST day boundaries');
eq('11:30pm IST is still the 22nd', istDateString(lateEvening), '2026-09-22');
eq('12:30am IST is the 23rd, though still the 22nd in UTC', istDateString(justAfterMidnight), '2026-09-23');
eq('IST midnight is 18:30 UTC the day before', startOfIstDay(lateEvening).toISOString(), '2026-09-21T18:30:00.000Z');

console.log('\nWeeks start on Monday, like Postgres date_trunc');
// 22 Sep 2026 is a Tuesday.
eq('Tuesday truncates to Monday 21st', istDateString(truncIst(lateEvening, 'week')), '2026-09-21');
eq('month truncates to the 1st', istDateString(truncIst(lateEvening, 'month')), '2026-09-01');

console.log('\nBucket keys match the SQL format');
eq('hour key', bucketKey(truncIst(lateEvening, 'hour')), '2026-09-22T23');
eq('day key', bucketKey(truncIst(lateEvening, 'day')), '2026-09-22T00');

console.log('\nRanges, "now" = 22 Sep 2026 23:30 IST');
const r7 = parseRange({ range: '7d' }, lateEvening);
eq('7d starts 16th IST', istDateString(r7.start), '2026-09-16');
eq('7d includes today', istDateString(new Date(r7.end.getTime() - 1)), '2026-09-22');
eq('7d is bucketed by day', r7.bucket, 'day');
eq('7d gives 7 buckets', bucketStarts(r7.start, r7.end, r7.bucket).length, 7);

const today = parseRange({ range: 'today' }, lateEvening);
eq('today is hourly', today.bucket, 'hour');
eq('today has 24 hourly buckets', bucketStarts(today.start, today.end, today.bucket).length, 24);

const yest = parseRange({ range: 'yesterday' }, lateEvening);
eq('yesterday is the 21st', istDateString(yest.start), '2026-09-21');
eq('yesterday ends at the start of today', yest.end.toISOString(), today.start.toISOString());

const lm = parseRange({ range: 'last-month' }, lateEvening);
eq('last month starts 1 Aug', istDateString(lm.start), '2026-08-01');
eq('last month ends 31 Aug inclusive', istDateString(new Date(lm.end.getTime() - 1)), '2026-08-31');

const ty = parseRange({ range: 'this-year' }, lateEvening);
eq('this year starts 1 Jan', istDateString(ty.start), '2026-01-01');
eq('this year is monthly', ty.bucket, 'month');

console.log('\nPrevious period is the same length, immediately before');
eq('prev ends where this starts', r7.prevEnd.toISOString(), r7.start.toISOString());
eq('prev is 7 days long', (r7.prevEnd.getTime() - r7.prevStart.getTime()) / 86_400_000, 7);

console.log('\nCustom range');
const c = parseRange({ range: 'custom', from: '2026-09-01', to: '2026-09-10' }, lateEvening);
eq('custom start', istDateString(c.start), '2026-09-01');
eq('custom end day is inclusive', istDateString(new Date(c.end.getTime() - 1)), '2026-09-10');
eq('custom spans 10 buckets', bucketStarts(c.start, c.end, c.bucket).length, 10);
const swapped = parseRange({ range: 'custom', from: '2026-09-10', to: '2026-09-01' }, lateEvening);
eq('reversed dates are swapped', istDateString(swapped.start), '2026-09-01');

console.log('\nBad input never throws');
eq('unknown range falls back to 30d', parseRange({ range: 'forever' }, lateEvening).key, '30d');
eq('31 Feb is rejected, not rolled into March', parseRange({ range: 'custom', from: '2026-02-31', to: '2026-03-05' }, lateEvening).key, 'custom');
eq('...and falls back to a sane default start', istDateString(parseRange({ range: 'custom', from: '2026-02-31', to: '2026-03-05' }, lateEvening).start), '2026-08-24');
eq('garbage custom falls back', istDateString(parseRange({ range: 'custom', from: 'nope', to: 'x' }, lateEvening).start), '2026-08-24');
eq('array params use the first value', parseRange({ range: ['7d', '30d'] }, lateEvening).key, '7d');
const huge = parseRange({ range: 'custom', from: '1990-01-01', to: '2026-09-22' }, lateEvening);
eq('span capped at ~3 years', Math.round((huge.end.getTime() - huge.start.getTime()) / 86_400_000), 1098);

console.log('');
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
console.log('All range checks passed.');
