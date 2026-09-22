import Link from 'next/link';
import { getAdminUser } from '@/lib/admin';
import { parseRange, rangeQuery } from '@/lib/admin/range';
import { listOrders, orderStatusCounts } from '@/lib/admin/queries';
import { num, rupees, when } from '@/lib/admin/format';
import {
  ORDER_LABEL,
  ORDER_STATUSES,
  ORDER_TONE,
  PAYMENT_LABEL,
  PAYMENT_STATUSES,
  PAYMENT_TONE,
  shippingLabel,
  type OrderStatusKey,
  type PaymentStatusKey,
} from '@/lib/admin/status';
import { Badge, Card, Empty, PageHeader, Pager, TableWrap, td, th } from '@/components/admin/ui';
import { RangePicker } from '@/components/admin/range-picker';

export const metadata = { title: 'Orders' };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function OrdersPage({ searchParams }: PageProps<'/admin/orders'>) {
  if (!(await getAdminUser())) return null;

  const sp = await searchParams;
  const range = parseRange(sp);

  // Only values the database actually has are passed through; anything else
  // is treated as "no filter" rather than an error.
  const status = (ORDER_STATUSES as readonly string[]).includes(one(sp.status) ?? '')
    ? one(sp.status)
    : undefined;
  const payment = (PAYMENT_STATUSES as readonly string[]).includes(one(sp.payment) ?? '')
    ? one(sp.payment)
    : undefined;
  const search = one(sp.q)?.slice(0, 100) ?? '';
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const [result, counts] = await Promise.all([
    listOrders({ start: range.start, end: range.end, status, payment, q: search, page }),
    orderStatusCounts(range.start, range.end),
  ]);

  const rq = rangeQuery(range);
  const href = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams(rq);
    const merged = { status, payment, q: search || undefined, ...overrides };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/admin/orders?${s}` : '/admin/orders';
  };
  const total = counts.reduce((s, c) => s + c.count, 0);

  return (
    <>
      <PageHeader
        title="Orders"
        description={
          search
            ? `Searching every order for “${search}”, whatever its date.`
            : `${num(result.total)} orders — ${range.label.toLowerCase()}.`
        }
      >
        <RangePicker current={range.key} from={range.fromInput} to={range.toInput} />
      </PageHeader>

      {/* Status tabs double as a summary. */}
      <nav aria-label="Filter by status" className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <Link
          href={href({ status: undefined, page: undefined })}
          aria-current={!status ? 'page' : undefined}
          className={`shrink-0 rounded-xl border px-3 py-1.5 text-sm ${
            !status ? 'border-a-gold/50 bg-a-gold/15 text-a-gold' : 'border-a-line text-a-muted hover:text-a-text'
          }`}
        >
          All <span className="tabular-nums">{num(total)}</span>
        </Link>
        {ORDER_STATUSES.map((s) => {
          const c = counts.find((x) => x.status === s)?.count ?? 0;
          const active = status === s;
          return (
            <Link
              key={s}
              href={href({ status: s, page: undefined })}
              aria-current={active ? 'page' : undefined}
              className={`shrink-0 rounded-xl border px-3 py-1.5 text-sm ${
                active ? 'border-a-gold/50 bg-a-gold/15 text-a-gold' : 'border-a-line text-a-muted hover:text-a-text'
              }`}
            >
              {ORDER_LABEL[s]} <span className="tabular-nums">{num(c)}</span>
            </Link>
          );
        })}
      </nav>

      <Card>
        {/* A plain GET form: filters work before any JavaScript has loaded. */}
        <form method="get" className="mb-4 flex flex-wrap items-end gap-2" role="search">
          {sp.range && <input type="hidden" name="range" value={one(sp.range)} />}
          {sp.from && <input type="hidden" name="from" value={one(sp.from)} />}
          {sp.to && <input type="hidden" name="to" value={one(sp.to)} />}
          {status && <input type="hidden" name="status" value={status} />}
          <div className="min-w-48 flex-1">
            <label htmlFor="q" className="mb-1 block text-xs text-a-muted">
              Search
            </label>
            <input
              id="q"
              name="q"
              defaultValue={search}
              placeholder="Order number, name, email or phone"
              className="w-full rounded-xl border border-a-line bg-a-bg px-3 py-2 text-sm text-a-text placeholder:text-a-muted/70"
            />
          </div>
          <div>
            <label htmlFor="payment" className="mb-1 block text-xs text-a-muted">
              Payment
            </label>
            <select
              id="payment"
              name="payment"
              defaultValue={payment ?? ''}
              className="rounded-xl border border-a-line bg-a-bg px-3 py-2 text-sm text-a-text"
            >
              <option value="">Any</option>
              {PAYMENT_STATUSES.map((p) => (
                <option key={p} value={p}>
                  {PAYMENT_LABEL[p]}
                </option>
              ))}
            </select>
          </div>
          <button className="rounded-xl bg-a-gold px-4 py-2 text-sm font-medium text-a-bg">Filter</button>
          {(search || payment) && (
            <Link href={href({ q: undefined, payment: undefined })} className="px-2 py-2 text-sm text-a-muted hover:text-a-text">
              Clear
            </Link>
          )}
        </form>

        {result.rows.length === 0 ? (
          <Empty title="No orders match">
            {search ? 'Try a shorter search, or part of the order number.' : 'Try a wider date range.'}
          </Empty>
        ) : (
          <TableWrap label="Orders">
            <thead>
              <tr>
                <th className={th}>Order</th>
                <th className={th}>Customer</th>
                <th className={th}>Date</th>
                <th className={`${th} text-right`}>Items</th>
                <th className={`${th} text-right`}>Amount</th>
                <th className={th}>Payment</th>
                <th className={th}>Status</th>
                <th className={th}>Shipping</th>
                <th className={th}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((o) => {
                const st = o.status as OrderStatusKey;
                const pay = o.paymentStatus as PaymentStatusKey;
                return (
                  <tr key={o.id} className="hover:bg-a-raised/50">
                    <td className={`${td} font-medium text-a-gold`}>{o.orderNumber}</td>
                    <td className={td}>
                      <span className="block text-a-text">{o.contactName}</span>
                      <span className="block text-xs text-a-muted">{o.contactEmail}</span>
                    </td>
                    <td className={`${td} whitespace-nowrap text-a-muted`}>{when(o.placedAt)}</td>
                    <td className={`${td} text-right tabular-nums`}>{o._count.items}</td>
                    <td className={`${td} text-right tabular-nums`}>{rupees(o.totalPaise)}</td>
                    <td className={td}>
                      <Badge tone={PAYMENT_TONE[pay]}>{PAYMENT_LABEL[pay]}</Badge>
                    </td>
                    <td className={td}>
                      <Badge tone={ORDER_TONE[st]}>{ORDER_LABEL[st]}</Badge>
                    </td>
                    <td className={`${td} whitespace-nowrap text-a-muted`}>{shippingLabel(st)}</td>
                    <td className={`${td} text-right`}>
                      <Link
                        href={`/admin/orders/${o.id}`}
                        className="rounded-lg border border-a-line px-3 py-1.5 text-xs hover:border-a-gold/40"
                      >
                        Manage<span className="sr-only"> {o.orderNumber}</span>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}

        <Pager page={result.page} pages={result.pages} href={(p) => href({ page: String(p) })} />
      </Card>
    </>
  );
}
