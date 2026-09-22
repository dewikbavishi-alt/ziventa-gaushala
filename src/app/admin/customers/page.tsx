import Link from 'next/link';
import { getAdminUser } from '@/lib/admin';
import { parseRange, rangeQuery } from '@/lib/admin/range';
import {
  CUSTOMER_SORTS,
  customerCounts,
  customerGrowth,
  listCustomers,
  type CustomerSort,
} from '@/lib/admin/queries';
import { day, num, rupees } from '@/lib/admin/format';
import { Card, Empty, PageHeader, Pager, StatCard, TableWrap, td, th } from '@/components/admin/ui';
import { BarChart } from '@/components/admin/charts';
import { RangePicker } from '@/components/admin/range-picker';
import { IconOrders, IconReturn, IconUser, IconVisitors } from '@/components/admin/icons';

export const metadata = { title: 'Customers' };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const FILTERS = [
  { key: 'all', label: 'Everyone' },
  { key: 'buyers', label: 'Have ordered' },
  { key: 'never', label: 'Never ordered' },
] as const;

export default async function CustomersPage({ searchParams }: PageProps<'/admin/customers'>) {
  if (!(await getAdminUser())) return null;

  const sp = await searchParams;
  const range = parseRange(sp);
  const sortRaw = one(sp.sort) ?? 'joined';
  const sort: CustomerSort = sortRaw in CUSTOMER_SORTS ? (sortRaw as CustomerSort) : 'joined';
  const dir = one(sp.dir) === 'asc' ? 'asc' : 'desc';
  const filterRaw = one(sp.filter);
  const filter = FILTERS.some((f) => f.key === filterRaw) ? (filterRaw as 'all' | 'buyers' | 'never') : 'all';
  const search = one(sp.q)?.slice(0, 100) ?? '';
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const [counts, growth, list] = await Promise.all([
    customerCounts(range.start, range.end),
    customerGrowth(range),
    listCustomers({ q: search, sort, dir, filter, page }),
  ]);

  const rq = rangeQuery(range);
  const link = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams(rq);
    const merged = { sort, dir, filter: filter === 'all' ? undefined : filter, q: search || undefined, ...o };
    for (const [k, v] of Object.entries(merged)) if (v && v !== 'all') p.set(k, v);
    return `/admin/customers?${p}`;
  };

  const sortHead = (col: CustomerSort, label: string, right = false) => {
    const active = sort === col;
    const nextDir = active && dir === 'desc' ? 'asc' : 'desc';
    return (
      <th
        className={`${th} ${right ? 'text-right' : ''}`}
        aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <Link
          href={link({ sort: col, dir: nextDir, page: undefined })}
          className={`inline-flex items-center gap-1 hover:text-a-text ${active ? 'text-a-gold' : ''}`}
        >
          {label}
          <span aria-hidden="true">{active ? (dir === 'asc' ? '↑' : '↓') : ''}</span>
        </Link>
      </th>
    );
  };

  return (
    <>
      <PageHeader title="Customers" description="Everyone with an account. Guest checkouts appear under Orders.">
        <RangePicker current={range.key} from={range.fromInput} to={range.toInput} />
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Registered" value={num(counts.total)} icon={<IconUser />}
          hint={<span className="text-xs text-a-muted">{counts.newInRange} new in range</span>} />
        <StatCard label="Active (30 days)" value={num(counts.active)} icon={<IconVisitors />} tone="green" />
        <StatCard label="Have ordered" value={num(counts.withOrders)} icon={<IconOrders />} tone="blue"
          hint={<span className="text-xs text-a-muted">{counts.withoutOrders} never have</span>} />
        <StatCard label="Returning buyers" value={num(counts.returning)} icon={<IconReturn />} tone="violet"
          hint={<span className="text-xs text-a-muted">two or more orders</span>} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="New sign-ups" className="xl:col-span-2">
          <BarChart
            points={growth}
            bucket={range.bucket}
            format={(v) => num(Math.round(v))}
            caption={`New customers, ${range.label}`}
            valueLabel="New customers"
            tone="orange"
          />
        </Card>
        <Card title="Joined recently">
          <dl className="divide-y divide-a-line text-sm">
            {[
              ['Today', counts.newToday],
              ['This week', counts.newWeek],
              ['This month', counts.newMonth],
              [range.label, counts.newInRange],
            ].map(([label, v]) => (
              <div key={String(label)} className="flex justify-between py-2.5">
                <dt className="text-a-muted">{label}</dt>
                <dd className="tabular-nums text-a-text">{num(Number(v))}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <Card className="mt-4">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <nav aria-label="Filter customers" className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <Link
                key={f.key}
                href={link({ filter: f.key, page: undefined })}
                aria-current={filter === f.key ? 'page' : undefined}
                className={`rounded-xl border px-3 py-1.5 text-sm ${
                  filter === f.key ? 'border-a-gold/50 bg-a-gold/15 text-a-gold' : 'border-a-line text-a-muted hover:text-a-text'
                }`}
              >
                {f.label}
              </Link>
            ))}
          </nav>
          <form method="get" role="search" className="flex gap-2">
            {sp.range && <input type="hidden" name="range" value={one(sp.range)} />}
            {filter !== 'all' && <input type="hidden" name="filter" value={filter} />}
            <label htmlFor="cq" className="sr-only">
              Search customers
            </label>
            <input
              id="cq"
              name="q"
              defaultValue={search}
              placeholder="Name, email or phone"
              className="w-56 rounded-xl border border-a-line bg-a-bg px-3 py-2 text-sm text-a-text placeholder:text-a-muted/70"
            />
            <button className="rounded-xl bg-a-gold px-3 py-2 text-sm font-medium text-a-bg">Search</button>
          </form>
        </div>

        {list.rows.length === 0 ? (
          <Empty title="No customers match" />
        ) : (
          <TableWrap label="Customers">
            <thead>
              <tr>
                {sortHead('name', 'Customer')}
                {sortHead('orders', 'Orders', true)}
                {sortHead('spent', 'Total spent', true)}
                {sortHead('last', 'Last order')}
                {sortHead('joined', 'Joined')}
              </tr>
            </thead>
            <tbody>
              {list.rows.map((c) => (
                <tr key={c.id} className="hover:bg-a-raised/50">
                  <td className={td}>
                    <span className="block text-a-text">{c.name ?? 'No name given'}</span>
                    <span className="block text-xs text-a-muted">{c.email ?? c.phone ?? '—'}</span>
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{num(c.orders)}</td>
                  <td className={`${td} text-right tabular-nums`}>{rupees(c.spent)}</td>
                  <td className={`${td} whitespace-nowrap text-a-muted`}>
                    {c.lastOrder ? day(c.lastOrder) : 'Never'}
                  </td>
                  <td className={`${td} whitespace-nowrap text-a-muted`}>{day(c.joined)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}

        <Pager page={list.page} pages={list.pages} href={(p) => link({ page: String(p) })} />
      </Card>
    </>
  );
}
