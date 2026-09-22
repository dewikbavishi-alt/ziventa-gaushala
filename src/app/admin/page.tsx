import Link from 'next/link';
import { getAdminUser } from '@/lib/admin';
import { prisma } from '@/lib/prisma';
import { parseRange, rangeQuery } from '@/lib/admin/range';
import * as q from '@/lib/admin/queries';
import { num, pctChange, rupees, rupeesCompact, when } from '@/lib/admin/format';
import {
  ORDER_LABEL,
  ORDER_STATUSES,
  ORDER_TONE,
  PAYMENT_LABEL,
  PAYMENT_TONE,
  type OrderStatusKey,
  type PaymentStatusKey,
} from '@/lib/admin/status';
import { Badge, Breakdown, Card, Empty, PageHeader, StatCard, TableWrap, td, th } from '@/components/admin/ui';
import { AreaChart, BarChart, DonutChart } from '@/components/admin/charts';
import { RangePicker } from '@/components/admin/range-picker';
import {
  IconAlert,
  IconBox,
  IconOrders,
  IconSales,
  IconUser,
  IconVisitors,
} from '@/components/admin/icons';

// Absolute: the admin layout's "%s | Ziventa Admin" template applies to the
// pages BELOW it, not to this one sitting in the same folder, which would
// otherwise fall back to the shop's "| Ziventa Gaushala".
export const metadata = { title: { absolute: 'Dashboard | Ziventa Admin' } };

function greeting(): string {
  const h = Number(
    new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()),
  );
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default async function Dashboard({ searchParams }: PageProps<'/admin'>) {
  // Checked here as well as in the layout - see the note there.
  const admin = await getAdminUser();
  if (!admin) return null;

  const range = parseRange(await searchParams);
  const rq = rangeQuery(range);
  const withRange = (path: string) => (rq ? `${path}?${rq}` : path);

  const [
    me,
    windows,
    totals,
    prevTotals,
    statuses,
    products,
    revenue,
    visitors,
    prevVisitors,
    visitorSeries,
    customers,
    recent,
    top,
  ] = await Promise.all([
    prisma.customer.findUnique({ where: { id: admin.id }, select: { fullName: true } }),
    q.salesWindows(),
    q.salesTotals(range.start, range.end),
    q.salesTotals(range.prevStart, range.prevEnd),
    q.orderStatusCounts(range.start, range.end),
    q.productCounts(),
    q.revenueSeries(range),
    q.visitorTotals(range.start, range.end),
    q.visitorTotals(range.prevStart, range.prevEnd),
    q.visitorSeries(range),
    q.customerCounts(range.start, range.end),
    q.recentOrders(12),
    q.productPerformance(range.start, range.end, { sort: 'revenue', limit: 50 }),
  ]);

  const name = me?.fullName?.split(' ')[0] || admin.email?.split('@')[0] || 'Admin';
  const count = (s: OrderStatusKey) => statuses.find((x) => x.status === s)?.count ?? 0;
  const inventoryAlerts = top
    .filter((p) => p.state === 'out' || p.state === 'low')
    .sort((a, b) => (a.stockCount ?? 0) - (b.stockCount ?? 0));
  const bestSellers = top.filter((p) => p.units > 0).slice(0, 5);

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${name}`}
        description={`Here is what happened in the shop — ${range.label.toLowerCase()}.`}
      >
        <RangePicker current={range.key} from={range.fromInput} to={range.toInput} />
      </PageHeader>

      {/* ------------------------------------------------ headline cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Total sales"
          value={rupees(totals.net)}
          change={pctChange(totals.net, prevTotals.net)}
          icon={<IconSales />}
          href={withRange('/admin/analytics')}
        />
        <StatCard
          label="Total orders"
          value={num(totals.orders)}
          change={pctChange(totals.orders, prevTotals.orders)}
          icon={<IconOrders />}
          tone="green"
          href={withRange('/admin/orders')}
        />
        <StatCard
          label="Products"
          value={num(products.total)}
          hint={<span className="text-xs text-a-muted">{products.available} available</span>}
          icon={<IconBox />}
          tone="blue"
          href={withRange('/admin/products')}
        />
        <StatCard
          label="Out of stock"
          value={num(products.outOfStock)}
          hint={
            <span className={`text-xs ${products.lowStock ? 'text-a-amber' : 'text-a-muted'}`}>
              {products.lowStock} running low
            </span>
          }
          icon={<IconAlert />}
          tone={products.outOfStock ? 'red' : 'grey'}
          href={withRange('/admin/inventory')}
        />
        <StatCard
          label="Website visitors"
          value={num(visitors.uniques)}
          change={pctChange(visitors.uniques, prevVisitors.uniques)}
          icon={<IconVisitors />}
          tone="violet"
          href={withRange('/admin/analytics')}
        />
        <StatCard
          label="Customers"
          value={num(customers.total)}
          hint={<span className="text-xs text-a-muted">{customers.newInRange} new in range</span>}
          icon={<IconUser />}
          tone="orange"
          href={withRange('/admin/customers')}
        />
      </div>

      {/* ------------------------------------------------ sales strip */}
      <Card className="mt-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['Today', rupees(windows.today)],
            ['This week', rupees(windows.week)],
            ['This month', rupees(windows.month)],
            ['This year', rupees(windows.year)],
            ['Average order', rupees(totals.aov)],
            ['Items sold', num(totals.unitsSold)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-a-muted">{label}</dt>
              <dd className="mt-0.5 font-display text-lg text-a-text">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {/* ------------------------------------------------ charts */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Revenue overview">
          <p className="-mt-2 mb-4 font-display text-2xl">{rupees(totals.net)}</p>
          <AreaChart
            points={revenue}
            bucket={range.bucket}
            format={rupeesCompact}
            caption={`Revenue, ${range.label}`}
            valueLabel="Revenue"
          />
        </Card>
        <Card title="Orders overview">
          <p className="-mt-2 mb-4 font-display text-2xl">{num(totals.orders)}</p>
          <BarChart
            points={revenue.map((p) => ({ ...p, value: p.value2 ?? 0 }))}
            bucket={range.bucket}
            format={(v) => num(Math.round(v))}
            caption={`Orders, ${range.label}`}
            valueLabel="Orders"
          />
        </Card>
        <Card title="Website visitors">
          <p className="-mt-2 mb-4 font-display text-2xl">{num(visitors.uniques)}</p>
          {visitors.views === 0 ? (
            <Empty title="No visits recorded in this range">
              Visitor counting started on 22 September 2026. Earlier visits were never recorded.
            </Empty>
          ) : (
            <AreaChart
              points={visitorSeries}
              bucket={range.bucket}
              format={(v) => num(Math.round(v))}
              tone="green"
              caption={`Unique visitors, ${range.label}`}
              valueLabel="Visitors"
            />
          )}
        </Card>
      </div>

      {/* ------------------------------------------------ distributions */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Order status">
          {totals.allOrders === 0 ? (
            <Empty title="No orders in this range" />
          ) : (
            <DonutChart
              caption="Orders by status"
              centerValue={num(totals.allOrders)}
              centerLabel="Total orders"
              segments={ORDER_STATUSES.map((s) => ({
                label: ORDER_LABEL[s],
                value: count(s),
                tone: ORDER_TONE[s],
              })).filter((s) => s.value > 0)}
            />
          )}
        </Card>

        <Card title="Sales breakdown">
          <Breakdown
            rows={[
              { label: 'Gross sales', value: rupees(totals.gross), tone: 'green' },
              { label: 'Discounts', value: `− ${rupees(totals.discounts)}`, tone: 'amber' },
              { label: 'Shipping', value: rupees(totals.shipping), tone: 'blue' },
              { label: 'Taxes', value: rupees(totals.taxes), tone: 'violet' },
              { label: 'Refunds', value: `− ${rupees(totals.refunds)}`, tone: 'red' },
              { label: 'Net revenue', value: rupees(totals.net), strong: true },
            ]}
          />
        </Card>

        <Card title="Order pipeline">
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {ORDER_STATUSES.map((s) => (
              <li key={s}>
                <Link
                  href={`/admin/orders?status=${s}${rq ? `&${rq}` : ''}`}
                  className="flex items-center justify-between gap-2 rounded-xl border border-a-line px-3 py-2 transition hover:border-a-gold/40"
                >
                  <span className="truncate text-a-muted">{ORDER_LABEL[s]}</span>
                  <span className="tabular-nums text-a-text">{num(count(s))}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* ------------------------------------------------ lists */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title="Recent orders"
          action={
            <Link
              href={withRange('/admin/orders')}
              className="rounded-xl border border-a-line px-3 py-1.5 text-xs hover:border-a-gold/40"
            >
              View all orders
            </Link>
          }
        >
          {recent.length === 0 ? (
            <Empty title="No orders yet" />
          ) : (
            <TableWrap label="Recent orders">
              <thead>
                <tr>
                  <th className={th}>Order</th>
                  <th className={th}>Customer</th>
                  <th className={`${th} text-right`}>Amount</th>
                  <th className={th}>Payment</th>
                  <th className={th}>Status</th>
                  <th className={th}>Date</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((o) => (
                  <tr key={o.id} className="hover:bg-a-raised/50">
                    <td className={td}>
                      <Link href={`/admin/orders/${o.id}`} className="font-medium text-a-gold hover:underline">
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td className={`${td} text-a-text`}>{o.contactName}</td>
                    <td className={`${td} text-right tabular-nums`}>{rupees(o.totalPaise)}</td>
                    <td className={td}>
                      <Badge tone={PAYMENT_TONE[o.paymentStatus as PaymentStatusKey]}>
                        {PAYMENT_LABEL[o.paymentStatus as PaymentStatusKey]}
                      </Badge>
                    </td>
                    <td className={td}>
                      <Badge tone={ORDER_TONE[o.status as OrderStatusKey]}>
                        {ORDER_LABEL[o.status as OrderStatusKey]}
                      </Badge>
                    </td>
                    <td className={`${td} whitespace-nowrap text-a-muted`}>{when(o.placedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>

        <div className="space-y-4">
          <Card
            title="Best sellers"
            action={
              <Link href={withRange('/admin/products')} className="text-xs text-a-muted hover:text-a-gold">
                View all
              </Link>
            }
          >
            {bestSellers.length === 0 ? (
              <Empty title="Nothing sold in this range" />
            ) : (
              <ol className="space-y-3">
                {bestSellers.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-3">
                    <span className="w-4 text-xs tabular-nums text-a-muted">{i + 1}</span>
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-a-gold/15 font-display text-a-gold"
                    >
                      {p.name.charAt(0)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-a-text">{p.name}</span>
                      <span className="block text-xs text-a-muted">
                        {num(p.units)} sold
                        {p.stockCount != null && ` · ${num(p.stockCount)} left`}
                      </span>
                    </span>
                    <span className="text-sm tabular-nums text-a-text">{rupeesCompact(p.revenue)}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card
            title="Inventory alerts"
            action={
              <Link href="/admin/inventory" className="text-xs text-a-muted hover:text-a-gold">
                Manage
              </Link>
            }
          >
            {inventoryAlerts.length === 0 ? (
              <Empty title="No stock alerts">
                {products.untracked === products.total
                  ? 'Stock is not being tracked for any product yet - set levels on the Inventory page.'
                  : 'Everything tracked is above its low-stock level.'}
              </Empty>
            ) : (
              <ul className="space-y-2">
                {inventoryAlerts.slice(0, 6).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-a-text">{p.name}</span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums text-a-muted">{p.stockCount}</span>
                      <Badge tone={p.state === 'out' ? 'red' : 'amber'}>
                        {p.state === 'out' ? 'Out of stock' : 'Low stock'}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
