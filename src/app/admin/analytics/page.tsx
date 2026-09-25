import { getAdminUser } from '@/lib/admin';
import { parseRange } from '@/lib/admin/range';
import * as q from '@/lib/admin/queries';
import { num, pct, pctChange, rupees, rupeesCompact } from '@/lib/admin/format';
import { ORDER_LABEL, ORDER_STATUSES, ORDER_TONE, type OrderStatusKey } from '@/lib/admin/status';
import { Breakdown, Card, Empty, PageHeader, StatCard } from '@/components/admin/ui';
import { AreaChart, BarChart, DonutChart } from '@/components/admin/charts';
import { RangePicker } from '@/components/admin/range-picker';
import { IconCheck, IconClock, IconReturn, IconSales, IconVisitors, IconX } from '@/components/admin/icons';

export const metadata = { title: 'Analytics' };

/** A labelled list with a proportional bar behind each count. */
function Ranked({ rows, empty }: { rows: { label: string; count: number }[]; empty: string }) {
  if (rows.length === 0) return <Empty title={empty} />;
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="relative overflow-hidden rounded-lg px-3 py-2 text-sm">
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 bg-a-gold/10"
            style={{ width: `${(r.count / max) * 100}%` }}
          />
          <span className="relative flex justify-between gap-3">
            <span className="truncate text-a-text">{r.label}</span>
            <span className="tabular-nums text-a-muted">{num(r.count)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default async function AnalyticsPage({ searchParams }: PageProps<'/admin/analytics'>) {
  if (!(await getAdminUser())) return null;

  const range = parseRange(await searchParams);

  const [totals, prev, series, statuses, cancelSeries, reasons, vTotals, vPrev, vWindows, vSeries, breakdown, newUsers] =
    await Promise.all([
      q.salesTotals(range.start, range.end),
      q.salesTotals(range.prevStart, range.prevEnd),
      q.revenueSeries(range),
      q.orderStatusCounts(range.start, range.end),
      q.cancellationSeries(range),
      q.cancellationReasons(range.start, range.end),
      q.visitorTotals(range.start, range.end),
      q.visitorTotals(range.prevStart, range.prevEnd),
      q.visitorWindows(),
      q.visitorSeries(range),
      q.visitorBreakdown(range.start, range.end),
      q.customerCounts(range.start, range.end),
    ]);

  const count = (s: OrderStatusKey) => statuses.find((x) => x.status === s)?.count ?? 0;
  const completed = count('DELIVERED');
  const pending = count('PENDING') + count('CONFIRMED') + count('PROCESSING');
  const inTransit = count('DISPATCHED') + count('OUT_FOR_DELIVERY');
  const conversion = vTotals.visits ? (totals.orders / vTotals.visits) * 100 : null;

  return (
    <>
      <PageHeader title="Analytics" description={`Sales, visitors and cancellations — ${range.label.toLowerCase()}.`}>
        <RangePicker current={range.key} from={range.fromInput} to={range.toInput} />
      </PageHeader>

      {/* =================================================== sales */}
      <h2 className="mb-3 font-display text-xl">Sales</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Net revenue" value={rupees(totals.net)} change={pctChange(totals.net, prev.net)} icon={<IconSales />} />
        <StatCard label="Orders" value={num(totals.orders)} change={pctChange(totals.orders, prev.orders)} icon={<IconCheck />} tone="green" />
        <StatCard label="Average order" value={rupees(totals.aov)} change={pctChange(totals.aov, prev.aov)} icon={<IconSales />} tone="blue" />
        <StatCard
          label="Visit to order"
          value={conversion == null ? '—' : pct(conversion)}
          hint={<span className="text-xs text-a-muted">orders per visit</span>}
          icon={<IconVisitors />}
          tone="violet"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Revenue over time" className="xl:col-span-2">
          <AreaChart
            points={series}
            bucket={range.bucket}
            format={rupeesCompact}
            caption={`Revenue, ${range.label}`}
            valueLabel="Revenue"
            height={240}
          />
        </Card>
        <Card title="Revenue breakdown">
          <Breakdown
            rows={[
              { label: 'Gross sales', value: rupees(totals.gross), tone: 'green' },
              { label: 'Discounts', value: `− ${rupees(totals.discounts)}`, tone: 'amber' },
              { label: 'Shipping charges', value: rupees(totals.shipping), tone: 'blue' },
              { label: 'Taxes', value: rupees(totals.taxes), tone: 'violet' },
              { label: 'Refunds', value: `− ${rupees(totals.refunds)}`, tone: 'red' },
              { label: 'Net revenue', value: rupees(totals.net), strong: true },
            ]}
          />
          <p className="mt-3 text-xs text-a-muted">
            Excludes cancelled orders and failed payments. Includes orders still awaiting payment.
          </p>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Order outcomes">
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              ['Total', totals.allOrders, 'text-a-text'],
              ['Delivered', completed, 'text-a-green'],
              ['In progress', pending, 'text-a-amber'],
              ['In transit', inTransit, 'text-a-violet'],
              ['Cancelled', count('CANCELLED'), 'text-a-red'],
              ['Returned', count('RETURNED'), 'text-a-muted'],
            ].map(([label, v, cls]) => (
              <div key={String(label)} className="rounded-xl border border-a-line p-3">
                <p className="text-xs text-a-muted">{label}</p>
                <p className={`mt-1 font-display text-xl ${cls}`}>{num(Number(v))}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Status distribution" className="xl:col-span-2">
          {totals.allOrders === 0 ? (
            <Empty title="No orders in this range" />
          ) : (
            <DonutChart
              caption="Orders by status"
              centerValue={num(totals.allOrders)}
              centerLabel="Orders"
              segments={ORDER_STATUSES.map((s) => ({ label: ORDER_LABEL[s], value: count(s), tone: ORDER_TONE[s] }))}
            />
          )}
        </Card>
      </div>

      {/* =================================================== visitors */}
      <h2 className="mb-3 mt-10 font-display text-xl">Website visitors</h2>
      <Card>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {[
            ['Today', vWindows.today],
            ['Yesterday', vWindows.yesterday],
            ['Last 7 days', vWindows.d7],
            ['Last 30 days', vWindows.d30],
            ['All time', vWindows.total],
          ].map(([label, v]) => (
            <div key={String(label)}>
              <dt className="text-xs text-a-muted">{label}</dt>
              <dd className="mt-0.5 font-display text-xl">{num(Number(v))}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-a-muted">Unique visitors. Counting began on 22 September 2026.</p>
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Unique visitors" value={num(vTotals.uniques)} change={pctChange(vTotals.uniques, vPrev.uniques)} />
        <StatCard label="Visits" value={num(vTotals.visits)} change={pctChange(vTotals.visits, vPrev.visits)} />
        <StatCard label="Page views" value={num(vTotals.views)} change={pctChange(vTotals.views, vPrev.views)} />
        <StatCard label="New visitors" value={num(vTotals.newVisitors)} />
        <StatCard label="Returning visitors" value={num(vTotals.returning)} />
        <StatCard label="Signed-in visitors" value={num(vTotals.registered)}
          hint={<span className="text-xs text-a-muted">{newUsers.newInRange} signed up</span>} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Visitors and visits" className="xl:col-span-2">
          {vTotals.views === 0 ? (
            <Empty title="No visits recorded in this range">
              Counting began on 22 September 2026. Figures build up from there.
            </Empty>
          ) : (
            <BarChart
              points={vSeries}
              bucket={range.bucket}
              format={(v) => num(Math.round(v))}
              caption={`Unique visitors and visits, ${range.label}`}
              valueLabel="Unique visitors"
              value2Label="Visits"
              tone="green"
              tone2="amber"
              height={240}
            />
          )}
        </Card>
        <Card title="Devices">
          <Ranked
            rows={breakdown.devices.map((d) => ({ label: d.label.charAt(0).toUpperCase() + d.label.slice(1), count: d.count }))}
            empty="No visits yet"
          />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card title="Most viewed pages">
          <Ranked rows={breakdown.pages} empty="No page views yet" />
        </Card>
        <Card title="Where visitors came from">
          <Ranked rows={breakdown.referrers} empty="No visits yet" />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card title="Browsers">
          <Ranked
            rows={breakdown.browsers.map((b) => ({
              label: b.label.charAt(0).toUpperCase() + b.label.slice(1),
              count: b.count,
            }))}
            empty="No visits yet"
          />
        </Card>

        {/*
          The point of recording the version. Two floors because the site has
          two: the shop is hand-written CSS that reaches back to Chrome 84,
          the account and sign-in pages are Tailwind v4 and need Chrome 111.
          Someone in between can buy as a guest but would find their account
          page missing most of its colour.
        */}
        <Card title="Can everyone use the site?">
          <Breakdown
            rows={[
              {
                label: `Cannot use the shop (below Chrome ${q.SUPPORT_FLOOR.shop.chrome} / Safari ${q.SUPPORT_FLOOR.shop.safari})`,
                value: num(breakdown.support.belowShop),
                tone: breakdown.support.belowShop ? 'red' : 'green',
                strong: breakdown.support.belowShop > 0,
              },
              {
                label: `Cannot use sign-in or account (below Chrome ${q.SUPPORT_FLOOR.account.chrome} / Safari ${q.SUPPORT_FLOOR.account.safari})`,
                value: num(breakdown.support.belowAccount),
                tone: breakdown.support.belowAccount ? 'amber' : 'green',
                strong: breakdown.support.belowAccount > 0,
              },
              {
                label: 'Oldest browser seen',
                value: breakdown.support.oldest
                  ? `${breakdown.support.oldest.label} ${breakdown.support.oldest.version}`
                  : '—',
              },
              {
                label: 'Version not reported',
                value: num(breakdown.support.unknownVersion),
                tone: 'grey',
              },
            ]}
          />
          <p className="mt-3 text-xs text-a-muted">
            Counted by visitor, not by visit. Views recorded before version tracking was added
            show as not reported — the version was never kept, so there is nothing to backfill.
          </p>
        </Card>
      </div>

      {/* =================================================== cancellations */}
      <h2 className="mb-3 mt-10 font-display text-xl">Cancellations</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard
          label="Cancelled orders"
          value={num(totals.cancelled)}
          change={pctChange(totals.cancelled, prev.cancelled)}
          invertChange
          icon={<IconX />}
          tone="red"
        />
        <StatCard
          label="Cancellation rate"
          value={pct(totals.cancellationRate)}
          change={pctChange(totals.cancellationRate, prev.cancellationRate)}
          invertChange
          icon={<IconClock />}
          tone="amber"
        />
        <StatCard label="Cancelled value" value={rupees(totals.cancelledValue)} icon={<IconReturn />} tone="grey" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Cancellations over time" className="xl:col-span-2">
          {totals.cancelled === 0 ? (
            <Empty title="No cancellations in this range" />
          ) : (
            <BarChart
              points={cancelSeries}
              bucket={range.bucket}
              format={(v) => num(Math.round(v))}
              caption={`Cancelled and total orders, ${range.label}`}
              valueLabel="Cancelled"
              value2Label="All orders"
              tone="red"
              tone2="grey"
            />
          )}
        </Card>
        <Card title="Reasons given">
          <Ranked rows={reasons.map((r) => ({ label: r.reason, count: r.count }))} empty="No cancellations to explain" />
        </Card>
      </div>
    </>
  );
}
