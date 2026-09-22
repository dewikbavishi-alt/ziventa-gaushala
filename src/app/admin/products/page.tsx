import Link from 'next/link';
import { getAdminUser } from '@/lib/admin';
import { parseRange, rangeQuery } from '@/lib/admin/range';
import {
  PRODUCT_SORTS,
  productCounts,
  productPerformance,
  type ProductSort,
  type StockState,
} from '@/lib/admin/queries';
import { num, rupees, rupeesCompact } from '@/lib/admin/format';
import { Badge, Card, Empty, PageHeader, StatCard, TableWrap, td, th } from '@/components/admin/ui';
import { RangePicker } from '@/components/admin/range-picker';
import { IconAlert, IconBox, IconCheck, IconStack } from '@/components/admin/icons';

export const metadata = { title: 'Products' };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const STATE_FILTERS: { key: 'all' | StockState; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'in', label: 'In stock' },
  { key: 'low', label: 'Low stock' },
  { key: 'out', label: 'Out of stock' },
  { key: 'untracked', label: 'Not tracked' },
];

const STATE_BADGE: Record<StockState, { tone: 'green' | 'amber' | 'red' | 'grey'; label: string }> = {
  in: { tone: 'green', label: 'In stock' },
  low: { tone: 'amber', label: 'Low stock' },
  out: { tone: 'red', label: 'Out of stock' },
  untracked: { tone: 'grey', label: 'Not tracked' },
};

export default async function ProductsPage({ searchParams }: PageProps<'/admin/products'>) {
  if (!(await getAdminUser())) return null;

  const sp = await searchParams;
  const range = parseRange(sp);
  const sort = (one(sp.sort) ?? 'revenue') as ProductSort;
  const safeSort: ProductSort = sort in PRODUCT_SORTS ? sort : 'revenue';
  const dir = one(sp.dir) === 'asc' ? 'asc' : 'desc';
  const stateParam = one(sp.state);
  const state = STATE_FILTERS.some((f) => f.key === stateParam) ? (stateParam as 'all' | StockState) : 'all';

  const [counts, rows] = await Promise.all([
    productCounts(),
    productPerformance(range.start, range.end, { sort: safeSort, dir }),
  ]);

  /**
   * "High performing" is relative, not a fixed rupee figure: the top third
   * of products by revenue in the chosen range, and only once there is
   * enough selling to say so. A threshold like "over Rs 10,000" would mark
   * nothing in a quiet month and everything at Diwali.
   */
  const earners = rows.filter((r) => r.revenue > 0).sort((a, b) => b.revenue - a.revenue);
  const topIds = new Set(earners.slice(0, Math.max(1, Math.ceil(earners.length / 3))).map((r) => r.id));
  const visible = state === 'all' ? rows : rows.filter((r) => r.state === state);
  const maxRevenue = Math.max(1, ...rows.map((r) => r.revenue));

  const rq = rangeQuery(range);
  const link = (o: Record<string, string>) => {
    const p = new URLSearchParams(rq);
    const merged: Record<string, string> = { sort: safeSort, dir, ...(state !== 'all' ? { state } : {}), ...o };
    for (const [k, v] of Object.entries(merged)) if (v && v !== 'all') p.set(k, v);
    return `/admin/products?${p}`;
  };

  /** Clicking a column sorts by it; clicking the same one again flips it. */
  const sortHead = (col: ProductSort, label: string, right = false) => {
    const active = safeSort === col;
    const nextDir = active && dir === 'desc' ? 'asc' : 'desc';
    return (
      <th className={`${th} ${right ? 'text-right' : ''}`} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <Link href={link({ sort: col, dir: nextDir })} className={`inline-flex items-center gap-1 hover:text-a-text ${active ? 'text-a-gold' : ''}`}>
          {label}
          <span aria-hidden="true">{active ? (dir === 'asc' ? '↑' : '↓') : ''}</span>
        </Link>
      </th>
    );
  };

  return (
    <>
      <PageHeader title="Products" description={`Performance — ${range.label.toLowerCase()}.`}>
        <RangePicker current={range.key} from={range.fromInput} to={range.toInput} />
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Total products" value={num(counts.total)} icon={<IconBox />} tone="blue"
          hint={<span className="text-xs text-a-muted">{counts.active} on sale</span>} />
        <StatCard label="Available" value={num(counts.available)} icon={<IconCheck />} tone="green" />
        <StatCard label="Low stock" value={num(counts.lowStock)} icon={<IconAlert />} tone={counts.lowStock ? 'amber' : 'grey'} />
        <StatCard label="Out of stock" value={num(counts.outOfStock)} icon={<IconAlert />} tone={counts.outOfStock ? 'red' : 'grey'} />
        <StatCard label="Units in stock" value={num(counts.inventory)} icon={<IconStack />}
          hint={<span className="text-xs text-a-muted">{counts.untracked} not tracked</span>} />
      </div>

      {counts.untracked > 0 && (
        <p className="mt-4 rounded-xl border border-a-amber/30 bg-a-amber/10 px-4 py-3 text-sm text-a-amber">
          {counts.untracked} of {counts.total} products have no stock level set, so they can never show as
          low or out of stock.{' '}
          <Link href="/admin/inventory" className="font-medium underline">
            Set stock levels
          </Link>
        </p>
      )}

      <Card className="mt-4">
        <nav aria-label="Filter by stock" className="mb-4 flex flex-wrap gap-2">
          {STATE_FILTERS.map((f) => (
            <Link
              key={f.key}
              href={link({ state: f.key })}
              aria-current={state === f.key ? 'page' : undefined}
              className={`rounded-xl border px-3 py-1.5 text-sm ${
                state === f.key ? 'border-a-gold/50 bg-a-gold/15 text-a-gold' : 'border-a-line text-a-muted hover:text-a-text'
              }`}
            >
              {f.label}
            </Link>
          ))}
        </nav>

        {visible.length === 0 ? (
          <Empty title="No products match this filter" />
        ) : (
          <TableWrap label="Product performance">
            <thead>
              <tr>
                {sortHead('name', 'Product')}
                {sortHead('units', 'Units sold', true)}
                {sortHead('revenue', 'Revenue', true)}
                {sortHead('stock', 'Stock', true)}
                {sortHead('orders', 'Orders', true)}
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const badge = STATE_BADGE[p.state];
                const high = topIds.has(p.id);
                return (
                  <tr
                    key={p.id}
                    className={`hover:bg-a-raised/50 ${p.state === 'out' ? 'bg-a-red/5' : p.state === 'low' ? 'bg-a-amber/5' : ''}`}
                  >
                    <td className={td}>
                      <span className="flex items-center gap-2">
                        <span className="text-a-text">{p.name}</span>
                        {high && <Badge tone="green">Top seller</Badge>}
                        {!p.isActive && <Badge tone="grey">Hidden</Badge>}
                      </span>
                      <span className="text-xs text-a-muted">
                        {p.sizeLabel ? `${p.sizeLabel} · ` : ''}
                        {rupees(p.pricePaise)}
                      </span>
                    </td>
                    <td className={`${td} text-right tabular-nums`}>{num(p.units)}</td>
                    <td className={`${td} text-right`}>
                      <span className="block tabular-nums">{rupeesCompact(p.revenue)}</span>
                      {/* A share bar: how this product compares at a glance. */}
                      <span aria-hidden="true" className="mt-1 ml-auto block h-1 w-20 rounded-full bg-a-line">
                        <span
                          className="block h-1 rounded-full bg-a-gold"
                          style={{ width: `${(p.revenue / maxRevenue) * 100}%` }}
                        />
                      </span>
                    </td>
                    <td className={`${td} text-right tabular-nums`}>
                      {p.stockCount == null ? <span className="text-a-muted">&mdash;</span> : num(p.stockCount)}
                    </td>
                    <td className={`${td} text-right tabular-nums`}>{num(p.orders)}</td>
                    <td className={td}>
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
