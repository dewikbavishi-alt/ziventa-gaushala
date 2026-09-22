import Link from 'next/link';
import { getAdminUser } from '@/lib/admin';
import { parseRange, rangeQuery } from '@/lib/admin/range';
import { paymentMethods, paymentStatusCounts } from '@/lib/admin/queries';
import { num, pct, rupees } from '@/lib/admin/format';
import { PAYMENT_LABEL, PAYMENT_STATUSES, PAYMENT_TONE, type PaymentStatusKey } from '@/lib/admin/status';
import { Card, Empty, PageHeader, StatCard, TableWrap, td, th } from '@/components/admin/ui';
import { DonutChart } from '@/components/admin/charts';
import { RangePicker } from '@/components/admin/range-picker';
import { IconAlert, IconCheck, IconClock, IconReturn } from '@/components/admin/icons';

export const metadata = { title: 'Payments' };

export default async function PaymentsPage({ searchParams }: PageProps<'/admin/payments'>) {
  if (!(await getAdminUser())) return null;

  const range = parseRange(await searchParams);
  const [statuses, methods] = await Promise.all([
    paymentStatusCounts(range.start, range.end),
    paymentMethods(range.start, range.end),
  ]);

  const get = (s: PaymentStatusKey) => statuses.find((x) => x.status === s);
  const paid = get('PAID');
  const pending = get('PENDING');
  const failed = get('FAILED');
  const refunded = [get('REFUNDED'), get('PARTIALLY_REFUNDED')];
  const refundedValue = refunded.reduce((s, r) => s + (r?.refunded ?? 0), 0);
  const refundedCount = refunded.reduce((s, r) => s + (r?.count ?? 0), 0);
  const totalCount = statuses.reduce((s, x) => s + x.count, 0);
  const collected = (paid?.value ?? 0) + refunded.reduce((s, r) => s + (r?.value ?? 0) - (r?.refunded ?? 0), 0);
  const successRate = totalCount ? ((paid?.count ?? 0) / totalCount) * 100 : 0;

  const rq = rangeQuery(range);

  return (
    <>
      <PageHeader title="Payments" description={`What has been collected — ${range.label.toLowerCase()}.`}>
        <RangePicker current={range.key} from={range.fromInput} to={range.toInput} />
      </PageHeader>

      {/*
        Said up front, because it changes how every figure below should be
        read: without a gateway, a payment is only "paid" once someone marks
        it so. Nothing here is fetched from a payment provider.
      */}
      <p className="mb-4 rounded-xl border border-a-amber/30 bg-a-amber/10 px-4 py-3 text-sm text-a-amber">
        No payment gateway is connected yet, so these figures reflect payments marked by hand on each
        order. Cash-on-delivery and UPI orders stay <strong>Pending</strong> until you mark them paid.
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Collected" value={rupees(collected)} icon={<IconCheck />} tone="green"
          hint={<span className="text-xs text-a-muted">{num(paid?.count ?? 0)} paid orders</span>} />
        <StatCard label="Awaiting payment" value={rupees(pending?.value ?? 0)} icon={<IconClock />} tone="amber"
          hint={<span className="text-xs text-a-muted">{num(pending?.count ?? 0)} orders</span>} />
        <StatCard label="Failed" value={rupees(failed?.value ?? 0)} icon={<IconAlert />} tone={failed?.count ? 'red' : 'grey'}
          hint={<span className="text-xs text-a-muted">{num(failed?.count ?? 0)} orders</span>} />
        <StatCard label="Refunded" value={rupees(refundedValue)} icon={<IconReturn />} tone="grey"
          hint={<span className="text-xs text-a-muted">{num(refundedCount)} orders</span>} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="Payment status">
          {totalCount === 0 ? (
            <Empty title="No orders in this range" />
          ) : (
            <>
              <DonutChart
                caption="Orders by payment status"
                centerValue={pct(successRate, 0)}
                centerLabel="Paid"
                segments={PAYMENT_STATUSES.map((s) => ({
                  label: PAYMENT_LABEL[s],
                  value: get(s)?.count ?? 0,
                  tone: PAYMENT_TONE[s],
                }))}
              />
              <p className="mt-4 text-right">
                <Link
                  href={`/admin/orders?payment=PENDING${rq ? `&${rq}` : ''}`}
                  className="text-sm text-a-gold hover:underline"
                >
                  See orders awaiting payment &rarr;
                </Link>
              </p>
            </>
          )}
        </Card>

        <Card title="Payment methods">
          {methods.length === 0 ? (
            <Empty title="No orders in this range" />
          ) : (
            <TableWrap label="Payment methods">
              <thead>
                <tr>
                  <th className={th}>Method</th>
                  <th className={`${th} text-right`}>Orders</th>
                  <th className={`${th} text-right`}>Value</th>
                </tr>
              </thead>
              <tbody>
                {methods.map((m) => (
                  <tr key={m.method}>
                    <td className={`${td} text-a-text`}>{m.method}</td>
                    <td className={`${td} text-right tabular-nums`}>{num(m.count)}</td>
                    <td className={`${td} text-right tabular-nums`}>{rupees(m.value)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
          <p className="mt-3 text-xs text-a-muted">
            The method the customer chose at checkout. It records their preference, not proof of payment.
          </p>
        </Card>
      </div>
    </>
  );
}
