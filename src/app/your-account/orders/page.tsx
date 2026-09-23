import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Prisma } from '@/generated/prisma/client';
import type { OrderStatusKey } from '@/lib/admin/status';
import { getCurrentCustomer } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AccountShell } from '@/components/account/account-shell';
import { OrderProgress } from '@/components/account/order-progress';
import { StatusBadge, rs, when } from '@/components/account/order-status';

export const metadata: Metadata = { title: 'Your orders' };

/** How many orders one page shows. */
const PAGE_SIZE = 20;

/**
 * The filters offered above the list.
 *
 * Deliberately four broad groups rather than all eight statuses: someone
 * looking through their own orders is asking "has it come yet?" or "what was
 * that one I sent back?", not sorting by fulfilment stage.
 */
const FILTERS = {
  all: { label: 'All', statuses: null },
  active: {
    label: 'In progress',
    statuses: ['PENDING', 'CONFIRMED', 'PROCESSING', 'DISPATCHED', 'OUT_FOR_DELIVERY'],
  },
  delivered: { label: 'Delivered', statuses: ['DELIVERED'] },
  closed: { label: 'Cancelled', statuses: ['CANCELLED', 'RETURNED'] },
} satisfies Record<string, { label: string; statuses: OrderStatusKey[] | null }>;

type FilterKey = keyof typeof FILTERS;

/**
 * One list of statuses per filter drives both the query and the count beside
 * the chip, so a chip can never claim a number the list below it disagrees
 * with. `null` means every status.
 */
const whereFor = (key: FilterKey): Prisma.OrderWhereInput => {
  const statuses = FILTERS[key].statuses;
  return statuses ? { status: { in: statuses } } : {};
};

const isFilter = (v: unknown): v is FilterKey => typeof v === 'string' && v in FILTERS;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const customer = await getCurrentCustomer();
  if (!customer) redirect('/login?next=%2Fyour-account%2Forders');

  /**
   * An unknown ?show= falls back to "all" rather than erroring. It arrives
   * from the address bar, so a typo should show the orders, not a broken page.
   */
  const raw = (await searchParams).show;
  const show: FilterKey = isFilter(raw) ? raw : 'all';

  /**
   * Filtered in the database, not in JavaScript.
   *
   * Filtering a page of 20 in memory would make "Delivered" mean "delivered,
   * among your last 20 orders" - which looks identical and is wrong for anyone
   * who has ordered more than that.
   *
   * customerId is always pinned to the signed-in customer, so no query
   * parameter can widen this beyond their own orders.
   */
  const [orders, byStatus] = await Promise.all([
    prisma.order.findMany({
      where: { customerId: customer.id, ...whereFor(show) },
      orderBy: { placedAt: 'desc' },
      take: PAGE_SIZE,
      include: { items: true },
    }),
    prisma.order.groupBy({
      by: ['status'],
      where: { customerId: customer.id },
      _count: { _all: true },
    }),
  ]);

  const countOf = (key: FilterKey) => {
    const statuses: readonly OrderStatusKey[] | null = FILTERS[key].statuses;
    return byStatus.reduce(
      (n, r) => (!statuses || statuses.includes(r.status) ? n + r._count._all : n),
      0,
    );
  };

  const total = countOf('all');

  return (
    <AccountShell
      title="Your Orders"
      description="Every order placed with this email address."
      backHref="/your-account"
      backLabel="Your Account"
    >
      {total === 0 ? (
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
        <>
          {/*
            Plain links, not buttons. The filter lives in the URL, so it
            survives a refresh, can be shared or bookmarked, and works with the
            back button - none of which is true of state held in the page.
          */}
          <nav aria-label="Filter orders" className="mb-4 flex flex-wrap gap-2">
            {(Object.keys(FILTERS) as FilterKey[]).map((key) => {
              const n = countOf(key);
              const active = key === show;
              return (
                <Link
                  key={key}
                  href={key === 'all' ? '/your-account/orders' : `/your-account/orders?show=${key}`}
                  aria-current={active ? 'page' : undefined}
                  className={`rounded-full border px-3.5 py-1.5 text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E4A35] ${
                    active
                      ? 'border-[#1E4A35] bg-[#1E4A35] text-[#FBF6EC]'
                      : 'border-[#2F4A3D]/20 bg-white text-[#2F4A3D] hover:border-[#C08A2E]/60'
                  } ${n === 0 && !active ? 'opacity-45' : ''}`}
                >
                  {FILTERS[key].label}
                  <span className={active ? 'text-[#FBF6EC]/70' : 'text-[#2F4A3D]/50'}> {n}</span>
                </Link>
              );
            })}
          </nav>

          {orders.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[#2F4A3D]/25 bg-white/60 p-8 text-center text-sm text-[#2F4A3D]/70">
              Nothing here. Try another filter above.
            </p>
          ) : (
            <div className="space-y-3">
              {orders.map((o) => (
                <article
                  key={o.id}
                  className="rounded-2xl border border-[#2F4A3D]/12 bg-white p-5 transition hover:border-[#C08A2E]/40"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold text-[#2F4A3D]">{o.orderNumber}</h2>
                        <StatusBadge status={o.status} />
                      </div>
                      <p className="mt-1 text-xs text-[#2F4A3D]/55">
                        Placed {when(o.placedAt)} &middot; {o.items.length}{' '}
                        {o.items.length === 1 ? 'item' : 'items'}
                      </p>
                    </div>
                    <p className="text-lg font-semibold text-[#1E4A35]">{rs(o.totalPaise)}</p>
                  </div>

                  <div className="mt-6">
                    <OrderProgress
                      status={o.status}
                      placedAt={o.placedAt}
                      confirmedAt={o.confirmedAt}
                      dispatchedAt={o.dispatchedAt}
                      deliveredAt={o.deliveredAt}
                    />
                  </div>

                  {/*
                    <details> rather than a React toggle: it opens and closes
                    with no JavaScript at all, so it still works while the page
                    is streaming in and on a slow connection, and the browser
                    handles the keyboard and screen-reader behaviour for free.
                  */}
                  <details className="group mt-4 border-t border-[#2F4A3D]/10 pt-3">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded text-sm font-medium text-[#2F4A3D] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E4A35]">
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className="h-4 w-4 transition-transform group-open:rotate-90"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                      Order details
                    </summary>

                    <ul className="mt-3 text-sm text-[#2F4A3D]/80">
                      {o.items.map((i) => (
                        <li key={i.id} className="flex justify-between gap-3 py-0.5">
                          <span>
                            {i.quantity} &times; {i.productName}
                          </span>
                          <span>{rs(i.unitPricePaise * i.quantity)}</span>
                        </li>
                      ))}
                      <li className="mt-1 flex justify-between gap-3 border-t border-[#2F4A3D]/10 pt-1 text-[#2F4A3D]/65">
                        <span>Delivery</span>
                        <span>{o.shippingPaise === 0 ? 'Free' : rs(o.shippingPaise)}</span>
                      </li>
                      <li className="flex justify-between gap-3 font-semibold text-[#2F4A3D]">
                        <span>Total</span>
                        <span>{rs(o.totalPaise)}</span>
                      </li>
                    </ul>

                    <div className="mt-3 grid gap-3 text-xs text-[#2F4A3D]/65 sm:grid-cols-2">
                      <div>
                        <p className="font-medium text-[#2F4A3D]/80">Delivering to</p>
                        <p className="mt-0.5">
                          {[o.shipLine1, o.shipLine2, o.shipCity, o.shipState, o.shipPostcode]
                            .filter(Boolean)
                            .join(', ')}
                        </p>
                      </div>
                      {o.trackingNumber && (
                        <div>
                          <p className="font-medium text-[#2F4A3D]/80">
                            {o.courier ?? 'Courier'} tracking
                          </p>
                          <p className="mt-0.5">{o.trackingNumber}</p>
                        </div>
                      )}
                    </div>
                  </details>

                  <div className="mt-4 flex flex-wrap gap-2 border-t border-[#2F4A3D]/10 pt-3">
                    <a
                      href="/#shop"
                      className="rounded-lg bg-[#1E4A35] px-3.5 py-1.5 text-xs font-medium text-[#FBF6EC] transition hover:bg-[#173a29] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E4A35]"
                    >
                      Buy again
                    </a>
                    {/*
                      The order number goes in the subject so we are not asking
                      a customer to find and copy it themselves before they can
                      ask a question about it.
                    */}
                    <a
                      href={`mailto:hello@ziventagaushala.com?subject=${encodeURIComponent(
                        `Order ${o.orderNumber}`,
                      )}`}
                      className="rounded-lg border border-[#2F4A3D]/20 px-3.5 py-1.5 text-xs font-medium text-[#2F4A3D] transition hover:bg-[#FBF6EC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E4A35]"
                    >
                      Ask about this order
                    </a>
                  </div>
                </article>
              ))}

              {countOf(show) > orders.length && (
                <p className="pt-1 text-center text-xs text-[#2F4A3D]/55">
                  Showing your {orders.length} most recent of {countOf(show)}.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </AccountShell>
  );
}
