import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAdminUser } from '@/lib/admin';
import { getOrder } from '@/lib/admin/queries';
import { rupeesExact, when } from '@/lib/admin/format';
import {
  NEXT_STATUSES,
  ORDER_LABEL,
  ORDER_TONE,
  PAYMENT_LABEL,
  PAYMENT_TONE,
  shippingLabel,
  type OrderStatusKey,
  type PaymentStatusKey,
} from '@/lib/admin/status';
import { Badge, Breakdown, Card, TableWrap, td, th } from '@/components/admin/ui';
import { ActionForm } from '@/components/admin/action-form';
import { changePayment, changeStatus, recordRefund, setShipState, updateShipping } from '../actions';

export const metadata = { title: 'Order' };

const field =
  'w-full rounded-xl border border-a-line bg-a-bg px-3 py-2 text-sm text-a-text placeholder:text-a-muted/70';

export default async function OrderPage({ params }: PageProps<'/admin/orders/[id]'>) {
  if (!(await getAdminUser())) return null;

  const { id } = await params;
  const order = await getOrder(id);
  if (!order) notFound();

  const status = order.status as OrderStatusKey;
  const pay = order.paymentStatus as PaymentStatusKey;
  const next = NEXT_STATUSES[status];
  const refundable = order.totalPaise - order.refundedPaise;

  const timeline = [
    ['Placed', order.placedAt],
    ['Confirmed', order.confirmedAt],
    ['Dispatched', order.dispatchedAt],
    ['Delivered', order.deliveredAt],
    ['Cancelled', order.cancelledAt],
    ['Returned', order.returnedAt],
  ].filter((t): t is [string, Date] => t[1] instanceof Date);

  return (
    <>
      <Link href="/admin/orders" className="mb-4 inline-block text-sm text-a-muted hover:text-a-gold">
        &larr; All orders
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl">{order.orderNumber}</h1>
          <p className="mt-1 text-sm text-a-muted">Placed {when(order.placedAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={ORDER_TONE[status]}>{ORDER_LABEL[status]}</Badge>
          <Badge tone={PAYMENT_TONE[pay]}>Payment: {PAYMENT_LABEL[pay]}</Badge>
          <Badge tone="grey">{shippingLabel(status)}</Badge>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* ------------------------------------------------ left: the order */}
        <div className="space-y-4 xl:col-span-2">
          <Card title="Items">
            <TableWrap label="Items in this order">
              <thead>
                <tr>
                  <th className={th}>Product</th>
                  <th className={`${th} text-right`}>Price</th>
                  <th className={`${th} text-right`}>Qty</th>
                  <th className={`${th} text-right`}>Total</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((i) => (
                  <tr key={i.id}>
                    <td className={`${td} text-a-text`}>{i.productName}</td>
                    <td className={`${td} text-right tabular-nums`}>{rupeesExact(i.unitPricePaise)}</td>
                    <td className={`${td} text-right tabular-nums`}>{i.quantity}</td>
                    <td className={`${td} text-right tabular-nums`}>
                      {rupeesExact(i.unitPricePaise * i.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            <div className="mt-4 sm:ml-auto sm:max-w-xs">
              <Breakdown
                rows={[
                  { label: 'Subtotal', value: rupeesExact(order.subtotalPaise) },
                  ...(order.discountPaise
                    ? [{ label: 'Discount', value: `− ${rupeesExact(order.discountPaise)}` }]
                    : []),
                  {
                    label: 'Delivery',
                    value: order.shippingPaise ? rupeesExact(order.shippingPaise) : 'Free',
                  },
                  ...(order.taxPaise ? [{ label: 'Tax', value: rupeesExact(order.taxPaise) }] : []),
                  { label: 'Total', value: rupeesExact(order.totalPaise), strong: true },
                  ...(order.refundedPaise
                    ? [
                        { label: 'Refunded', value: `− ${rupeesExact(order.refundedPaise)}` },
                        { label: 'Net', value: rupeesExact(refundable), strong: true },
                      ]
                    : []),
                ]}
              />
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Customer">
              <p className="text-a-text">{order.contactName}</p>
              <p className="mt-1 text-sm">
                <a className="text-a-gold hover:underline" href={`mailto:${order.contactEmail}`}>
                  {order.contactEmail}
                </a>
              </p>
              <p className="mt-1 text-sm">
                <a className="text-a-gold hover:underline" href={`tel:${order.contactPhone}`}>
                  {order.contactPhone}
                </a>
              </p>
              <p className="mt-3 text-xs text-a-muted">
                {order.customer
                  ? `Has an account since ${when(order.customer.createdAt)}.`
                  : 'Guest checkout - no account.'}
              </p>
            </Card>

            <Card title="Delivery address">
              <address className="text-sm not-italic leading-relaxed text-a-text">
                {order.shipLine1}
                {order.shipLine2 && <><br />{order.shipLine2}</>}
                <br />
                {order.shipCity}
                {order.shipState ? `, ${order.shipState}` : ''} {order.shipPostcode}
              </address>
              {order.notes && (
                <p className="mt-3 rounded-lg bg-a-raised px-3 py-2 text-xs text-a-muted">{order.notes}</p>
              )}
              {!order.shipState?.trim() && (
                <ActionForm
                  action={setShipState}
                  submitLabel="Save state"
                  tone="quiet"
                  className="mt-3 space-y-2 rounded-xl border border-a-amber/40 bg-a-amber/5 p-3"
                >
                  <input type="hidden" name="orderId" value={order.id} />
                  <label htmlFor="ship-state" className="block text-xs text-a-amber">
                    No state recorded - placed before checkout asked for one
                  </label>
                  <input
                    id="ship-state"
                    name="state"
                    required
                    minLength={2}
                    placeholder="e.g. Gujarat"
                    className={field}
                  />
                </ActionForm>
              )}
            </Card>
          </div>

          <Card title="Timeline">
            <ol className="space-y-2 text-sm">
              {timeline.map(([label, at]) => (
                <li key={label} className="flex justify-between gap-3">
                  <span className="text-a-muted">{label}</span>
                  <span className="tabular-nums text-a-text">{when(at)}</span>
                </li>
              ))}
            </ol>
            {order.cancelReason && (
              <p className="mt-3 rounded-lg bg-a-red/10 px-3 py-2 text-sm text-a-red">
                Cancelled: {order.cancelReason}
              </p>
            )}
          </Card>
        </div>

        {/* ------------------------------------------------ right: actions */}
        <div className="space-y-4">
          <Card title="Update status">
            {next.length === 0 ? (
              <p className="text-sm text-a-muted">
                This order is {ORDER_LABEL[status].toLowerCase()}. It cannot move any further.
              </p>
            ) : (
              <div className="space-y-3">
                {next
                  .filter((s) => s !== 'CANCELLED')
                  .map((s) =>
                    s === 'DISPATCHED' ? (
                      <ActionForm
                        key={s}
                        action={changeStatus}
                        submitLabel="Mark dispatched"
                        className="space-y-2 rounded-xl border border-a-line p-3"
                      >
                        <input type="hidden" name="orderId" value={order.id} />
                        <input type="hidden" name="status" value={s} />
                        <label className="block text-xs text-a-muted" htmlFor="d-courier">
                          Courier (optional)
                        </label>
                        <input id="d-courier" name="courier" defaultValue={order.courier ?? ''} className={field} />
                        <label className="block text-xs text-a-muted" htmlFor="d-tracking">
                          Tracking number (optional)
                        </label>
                        <input
                          id="d-tracking"
                          name="trackingNumber"
                          defaultValue={order.trackingNumber ?? ''}
                          className={field}
                        />
                      </ActionForm>
                    ) : (
                      <ActionForm
                        key={s}
                        action={changeStatus}
                        submitLabel={`Mark ${ORDER_LABEL[s].toLowerCase()}`}
                        tone={s === 'RETURNED' ? 'quiet' : 'default'}
                        confirm={
                          s === 'RETURNED'
                            ? {
                                title: `Mark ${order.orderNumber} as returned?`,
                                body: 'Returned orders are final. Record any refund separately below.',
                                confirmLabel: 'Mark returned',
                              }
                            : undefined
                        }
                      >
                        <input type="hidden" name="orderId" value={order.id} />
                        <input type="hidden" name="status" value={s} />
                      </ActionForm>
                    ),
                  )}

                {next.includes('CANCELLED') && (
                  <ActionForm
                    action={changeStatus}
                    submitLabel="Cancel order"
                    tone="danger"
                    className="space-y-2 border-t border-a-line pt-3"
                    confirm={{
                      title: `Cancel ${order.orderNumber}?`,
                      body: 'This cannot be undone - a cancelled order cannot be dispatched. If the customer has paid, record a refund afterwards.',
                      confirmLabel: 'Yes, cancel it',
                    }}
                  >
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="status" value="CANCELLED" />
                    <label className="block text-xs text-a-muted" htmlFor="c-reason">
                      Reason (optional, shown in cancellation reports)
                    </label>
                    <input
                      id="c-reason"
                      name="cancelReason"
                      maxLength={300}
                      placeholder="e.g. Customer asked to cancel"
                      className={field}
                    />
                  </ActionForm>
                )}
              </div>
            )}
          </Card>

          <Card title="Payment">
            {order.refundedPaise > 0 ? (
              <p className="text-sm text-a-muted">
                A refund is recorded, so the payment status is fixed at {PAYMENT_LABEL[pay].toLowerCase()}.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(['PAID', 'PENDING', 'FAILED'] as const)
                  .filter((p) => p !== pay)
                  .map((p) => (
                    <ActionForm
                      key={p}
                      action={changePayment}
                      submitLabel={`Mark ${PAYMENT_LABEL[p].toLowerCase()}`}
                      tone={p === 'FAILED' ? 'danger' : p === 'PAID' ? 'default' : 'quiet'}
                    >
                      <input type="hidden" name="orderId" value={order.id} />
                      <input type="hidden" name="paymentStatus" value={p} />
                    </ActionForm>
                  ))}
              </div>
            )}
            {order.paymentReference && (
              <p className="mt-3 text-xs text-a-muted">Reference: {order.paymentReference}</p>
            )}
          </Card>

          {refundable > 0 && pay !== 'PENDING' && pay !== 'FAILED' && (
            <Card title="Record a refund">
              <p className="mb-3 text-xs text-a-muted">
                This records money you have already sent back. No payment gateway is connected, so it
                does not move any money itself.
              </p>
              <ActionForm
                action={recordRefund}
                submitLabel="Record refund"
                tone="danger"
                className="space-y-2"
                confirm={{
                  title: 'Record this refund?',
                  body: 'Refunds cannot be un-recorded. Make sure the money has actually been sent back first.',
                  confirmLabel: 'Record refund',
                }}
              >
                <input type="hidden" name="orderId" value={order.id} />
                <label className="block text-xs text-a-muted" htmlFor="r-amount">
                  Amount in rupees (up to {rupeesExact(refundable)})
                </label>
                <input
                  id="r-amount"
                  name="amount"
                  inputMode="decimal"
                  required
                  pattern="\d{1,7}(\.\d{1,2})?"
                  placeholder={(refundable / 100).toFixed(2)}
                  className={field}
                />
                {NEXT_STATUSES[status].includes('RETURNED') && (
                  <label className="flex items-center gap-2 text-sm text-a-muted">
                    <input type="checkbox" name="markReturned" className="accent-a-gold" />
                    Also mark the order returned
                  </label>
                )}
              </ActionForm>
            </Card>
          )}

          <Card title="Shipping details">
            <ActionForm action={updateShipping} submitLabel="Save" tone="quiet" className="space-y-2">
              <input type="hidden" name="orderId" value={order.id} />
              <label className="block text-xs text-a-muted" htmlFor="s-courier">
                Courier
              </label>
              <input id="s-courier" name="courier" defaultValue={order.courier ?? ''} className={field} />
              <label className="block text-xs text-a-muted" htmlFor="s-tracking">
                Tracking number
              </label>
              <input
                id="s-tracking"
                name="trackingNumber"
                defaultValue={order.trackingNumber ?? ''}
                className={field}
              />
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
