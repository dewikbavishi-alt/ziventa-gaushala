import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentCustomer } from '@/lib/auth';
import { AccountShell } from '@/components/account/account-shell';

export const metadata: Metadata = { title: 'Your orders' };

const rs = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const when = (d: Date) =>
  new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);

/**
 * Status worded for a customer, not for the database. Kept in step with the
 * admin's statuses in src/lib/admin/status.ts - same stages, customer words.
 */
const STATUS_TEXT: Record<string, string> = {
  PENDING: 'Awaiting confirmation',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Being packed',
  DISPATCHED: 'On its way',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
};

const STATUS_COLOUR: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  CONFIRMED: 'bg-sky-100 text-sky-800',
  PROCESSING: 'bg-orange-100 text-orange-800',
  DISPATCHED: 'bg-violet-100 text-violet-800',
  OUT_FOR_DELIVERY: 'bg-violet-100 text-violet-800',
  DELIVERED: 'bg-emerald-100 text-emerald-900',
  CANCELLED: 'bg-stone-200 text-stone-700',
  RETURNED: 'bg-stone-200 text-stone-700',
};

export default async function OrdersPage() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect('/login?next=%2Fyour-account%2Forders');

  return (
    <AccountShell
      title="Your Orders"
      description="Every order placed with this email address."
      backHref="/your-account"
      backLabel="Your Account"
    >
      {customer.orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#2F4A3D]/25 bg-white/60 p-10 text-center">
          <p className="text-[#2F4A3D]">You have not ordered anything yet.</p>
          <p className="mt-1 text-sm text-[#2F4A3D]/65">
            Orders you placed as a guest with this email appear here automatically.
          </p>
          <a
            href="/#shop"
            className="mt-5 inline-block rounded-lg bg-[#1E4A35] px-5 py-2.5 text-sm font-medium text-[#FBF6EC] transition hover:bg-[#173a29] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E4A35]"
          >
            Browse the shop
          </a>
        </div>
      ) : (
        <div className="space-y-3">
          {customer.orders.map((o) => (
            <article key={o.id} className="rounded-2xl border border-[#2F4A3D]/12 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-[#2F4A3D]">{o.orderNumber}</h2>
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        STATUS_COLOUR[o.status] ?? 'bg-stone-200 text-stone-700'
                      }`}
                    >
                      {STATUS_TEXT[o.status] ?? o.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#2F4A3D]/55">{when(o.placedAt)}</p>
                </div>
                <p className="text-lg font-semibold text-[#1E4A35]">{rs(o.totalPaise)}</p>
              </div>

              <ul className="mt-3 border-t border-[#2F4A3D]/10 pt-2 text-sm text-[#2F4A3D]/80">
                {o.items.map((i) => (
                  <li key={i.id} className="flex justify-between gap-3 py-0.5">
                    <span>
                      {i.quantity} &times; {i.productName}
                    </span>
                    <span>{rs(i.unitPricePaise * i.quantity)}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-[#2F4A3D]/10 pt-2">
                <p className="text-xs text-[#2F4A3D]/60">
                  Delivering to{' '}
                  {[o.shipLine1, o.shipLine2, o.shipCity, o.shipState, o.shipPostcode]
                    .filter(Boolean)
                    .join(', ')}
                </p>
                <a
                  href="/#shop"
                  className="rounded-lg border border-[#2F4A3D]/20 px-3 py-1.5 text-xs font-medium text-[#2F4A3D] transition hover:bg-[#FBF6EC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E4A35]"
                >
                  Buy again
                </a>
              </div>
            </article>
          ))}

          {customer._count.orders > customer.orders.length && (
            <p className="pt-1 text-center text-xs text-[#2F4A3D]/55">
              Showing your {customer.orders.length} most recent orders of {customer._count.orders}.
            </p>
          )}
        </div>
      )}
    </AccountShell>
  );
}
