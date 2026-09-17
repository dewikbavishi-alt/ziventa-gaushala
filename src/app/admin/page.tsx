import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getAdminUser } from '@/lib/admin';
import { getCurrentUser } from '@/lib/supabase/server';
import { updateLeadStatus, updateOrderState, updateOrderStatus } from './actions';

export const dynamic = 'force-dynamic';

const rs = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const when = (d: Date) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(d);

const ORDER_STATUSES = ['PENDING', 'PAID', 'FAILED', 'CANCELLED', 'SHIPPED', 'DELIVERED', 'REFUNDED'];
const LEAD_STATUSES = ['new', 'contacted', 'converted', 'declined'];

const STATUS_COLOUR: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  PAID: 'bg-emerald-100 text-emerald-800',
  SHIPPED: 'bg-sky-100 text-sky-800',
  DELIVERED: 'bg-emerald-100 text-emerald-900',
  FAILED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-stone-200 text-stone-700',
  REFUNDED: 'bg-stone-200 text-stone-700',
};

export default async function AdminPage() {
  const admin = await getAdminUser();

  if (!admin) {
    // Distinguish "not signed in" from "signed in but not an admin", so you do
    // not stare at a login page you are already past.
    const user = await getCurrentUser();
    if (!user) redirect('/login?next=%2Fadmin');
    return (
      <main className="min-h-screen bg-[#FBF6EC] flex items-center justify-center px-4">
        <div className="max-w-md rounded-2xl border border-[#2F4A3D]/10 bg-white p-8 text-center">
          <h1 className="text-xl font-semibold text-[#2F4A3D]">Not an admin account</h1>
          <p className="mt-2 text-sm text-[#2F4A3D]/70">
            You are signed in as <strong>{user.email}</strong>, which is not on the
            admin list. Add it to <code>ADMIN_EMAILS</code> to get in.
          </p>
          <form action="/auth/signout" method="post" className="mt-5">
            <button className="rounded-lg border border-[#2F4A3D]/20 px-4 py-2 text-sm">
              Sign out
            </button>
          </form>
        </div>
      </main>
    );
  }

  /**
   * Thirty days back, from midnight, so "last 30 days" means whole days rather
   * than a window that slides through the afternoon and makes today's figure
   * look different every time the page is refreshed.
   */
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - 29);

  const [
    orders,
    leads,
    products,
    customers,
    memberships,
    paidAgg,
    pendingAgg,
    allOrders,
    statusCounts,
    itemsSold,
    leadsByStatus,
    recentOrderAgg,
  ] = await Promise.all([
    prisma.order.findMany({ orderBy: { placedAt: 'desc' }, include: { items: true }, take: 100 }),
    prisma.lead.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.product.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.customer.count(),
    prisma.membership.count(),
    prisma.order.aggregate({ where: { status: 'PAID' }, _sum: { totalPaise: true } }),
    prisma.order.aggregate({ where: { status: 'PENDING' }, _sum: { totalPaise: true } }),
    // Every order's date and total, for the daily chart and the averages.
    // Only two small columns, so this stays cheap as the table grows.
    prisma.order.findMany({
      where: { placedAt: { gte: since } },
      select: { placedAt: true, totalPaise: true },
      orderBy: { placedAt: 'asc' },
    }),
    prisma.order.groupBy({ by: ['status'], _count: { _all: true }, _sum: { totalPaise: true } }),
    // Grouped in the database rather than summed in JavaScript, so it does not
    // need every order item loaded into memory to answer one question.
    prisma.orderItem.groupBy({
      by: ['productName'],
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 5,
    }),
    prisma.lead.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.order.aggregate({
      where: { placedAt: { gte: since } },
      _count: { _all: true },
      _sum: { totalPaise: true },
      _avg: { totalPaise: true },
    }),
  ]);

  const seatsLeft = 250 - memberships;

  // ---- daily series for the last 30 days, zero-filled -----------------
  //
  // Zero-filling matters: without it a quiet day is simply absent and the
  // chart silently closes the gap, making a week with two orders look like a
  // week of steady trade.
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const byDay = new Map<string, { orders: number; paise: number }>();

  for (let i = 0; i < 30; i += 1) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    byDay.set(dayKey(d), { orders: 0, paise: 0 });
  }
  for (const o of allOrders) {
    const bucket = byDay.get(dayKey(o.placedAt));
    if (bucket) {
      bucket.orders += 1;
      bucket.paise += o.totalPaise;
    }
  }

  const series = [...byDay.entries()].map(([day, v]) => ({ day, ...v }));
  const peak = Math.max(1, ...series.map((s) => s.paise));

  const convertedLeads = leadsByStatus.find((l) => l.status === 'converted')?._count._all ?? 0;
  const totalLeads = leadsByStatus.reduce((n, l) => n + l._count._all, 0);
  const conversion = totalLeads === 0 ? 0 : Math.round((convertedLeads / totalLeads) * 100);

  return (
    <main className="min-h-screen bg-[#FBF6EC] px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-[#2F4A3D]">Ziventa admin</h1>
            <p className="mt-1 text-sm text-[#2F4A3D]/70">Signed in as {admin.email}</p>
          </div>
          <form action="/auth/signout" method="post">
            <button className="rounded-lg border border-[#2F4A3D]/20 bg-white px-3 py-1.5 text-sm text-[#2F4A3D]">
              Sign out
            </button>
          </form>
        </header>

        <section className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Orders" value={String(orders.length)} />
          <Stat label="Paid" value={rs(paidAgg._sum.totalPaise ?? 0)} />
          <Stat label="Awaiting payment" value={rs(pendingAgg._sum.totalPaise ?? 0)} />
          <Stat label="Enquiries" value={String(leads.length)} />
          <Stat label="Accounts" value={String(customers)} />
          <Stat label="Seats left" value={String(seatsLeft)} hint={`${memberships} of 250 taken`} />
        </section>

        {/* ------------------------------------------------------- analytics */}
        <h2 className="mb-3 text-lg font-semibold text-[#2F4A3D]">Last 30 days</h2>

        <section className="mb-6 grid gap-3 sm:grid-cols-3">
          <Stat label="Orders" value={String(recentOrderAgg._count._all)} />
          <Stat label="Value" value={rs(recentOrderAgg._sum.totalPaise ?? 0)} />
          <Stat
            label="Average order"
            value={rs(Math.round(recentOrderAgg._avg.totalPaise ?? 0))}
          />
        </section>

        {/* Bars are plain divs on purpose - a charting library would be ~100KB
            to draw thirty rectangles, and this has no runtime to go wrong. */}
        <div className="mb-10 rounded-xl border border-[#2F4A3D]/10 bg-white p-4">
          <div className="flex h-32 items-end gap-[3px]">
            {series.map((s) => (
              <div
                key={s.day}
                title={`${s.day}: ${s.orders} order${s.orders === 1 ? '' : 's'}, ${rs(s.paise)}`}
                className="flex-1 rounded-t bg-[#1E4A35] transition hover:bg-[#D9A92B]"
                style={{
                  // A day with orders always shows at least a sliver, so real
                  // trade is never mistaken for a blank day.
                  height: s.paise === 0 ? '2px' : `${Math.max(6, (s.paise / peak) * 100)}%`,
                  opacity: s.paise === 0 ? 0.25 : 1,
                }}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[0.65rem] text-[#2F4A3D]/50">
            <span>{series[0]?.day}</span>
            <span>Peak day {rs(peak)}</span>
            <span>{series[series.length - 1]?.day}</span>
          </div>
        </div>

        <div className="mb-10 grid gap-4 lg:grid-cols-3">
          <Panel title="Orders by status">
            {statusCounts.length === 0 && <Empty>Nothing yet.</Empty>}
            {statusCounts.map((s) => (
              <Row
                key={s.status}
                left={
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      STATUS_COLOUR[s.status] ?? 'bg-stone-200 text-stone-700'
                    }`}
                  >
                    {s.status}
                  </span>
                }
                right={`${s._count._all} · ${rs(s._sum.totalPaise ?? 0)}`}
              />
            ))}
          </Panel>

          <Panel title="Best sellers">
            {itemsSold.length === 0 && <Empty>Nothing sold yet.</Empty>}
            {itemsSold.map((i) => (
              <Row
                key={i.productName}
                left={<span className="text-sm text-[#2F4A3D]">{i.productName}</span>}
                right={`${i._sum.quantity ?? 0} sold`}
              />
            ))}
          </Panel>

          <Panel title="Membership funnel">
            <Row left={<span className="text-sm text-[#2F4A3D]">Enquiries</span>} right={String(totalLeads)} />
            <Row left={<span className="text-sm text-[#2F4A3D]">Converted</span>} right={String(convertedLeads)} />
            <Row
              left={<span className="text-sm text-[#2F4A3D]">Conversion</span>}
              right={`${conversion}%`}
            />
            <Row
              left={<span className="text-sm text-[#2F4A3D]">Seats taken</span>}
              right={`${memberships} of 250`}
            />
          </Panel>
        </div>

        {/* ---------------------------------------------------------- orders */}
        <h2 className="mb-3 text-lg font-semibold text-[#2F4A3D]">Orders</h2>
        <div className="mb-10 space-y-3">
          {orders.length === 0 && <Empty>No orders yet.</Empty>}
          {orders.map((o) => (
            <article key={o.id} className="rounded-xl border border-[#2F4A3D]/10 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#2F4A3D]">{o.orderNumber}</span>
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        STATUS_COLOUR[o.status] ?? 'bg-stone-200 text-stone-700'
                      }`}
                    >
                      {o.status}
                    </span>
                    {!o.customerId && (
                      <span className="rounded bg-stone-100 px-2 py-0.5 text-xs text-stone-600">
                        guest
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-[#2F4A3D]">
                    {o.contactName} &middot;{' '}
                    <a className="underline" href={`tel:${o.contactPhone}`}>{o.contactPhone}</a>{' '}
                    &middot;{' '}
                    <a className="underline" href={`mailto:${o.contactEmail}`}>{o.contactEmail}</a>
                  </p>
                  <p className="mt-0.5 text-sm text-[#2F4A3D]/70">
                    {[o.shipLine1, o.shipLine2, o.shipCity, o.shipState, o.shipPostcode]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                  <p className="mt-0.5 text-xs text-[#2F4A3D]/50">{when(o.placedAt)}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-[#1E4A35]">{rs(o.totalPaise)}</p>
                  <p className="text-xs text-[#2F4A3D]/60">
                    {rs(o.subtotalPaise)} + {o.shippingPaise === 0 ? 'free delivery' : rs(o.shippingPaise)}
                  </p>
                </div>
              </div>

              <ul className="mt-3 border-t border-[#2F4A3D]/10 pt-2 text-sm text-[#2F4A3D]/80">
                {o.items.map((i) => (
                  <li key={i.id} className="flex justify-between py-0.5">
                    <span>{i.quantity} × {i.productName}</span>
                    <span>{rs(i.unitPricePaise * i.quantity)}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[#2F4A3D]/10 pt-3">
                <form action={updateOrderStatus} className="flex items-center gap-2">
                  <input type="hidden" name="orderId" value={o.id} />
                  <select
                    name="status"
                    defaultValue={o.status}
                    className="rounded-lg border border-[#2F4A3D]/20 bg-white px-2 py-1 text-sm"
                  >
                    {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button className="rounded-lg bg-[#1E4A35] px-3 py-1 text-sm text-[#FBF6EC]">
                    Update
                  </button>
                </form>

                {!o.shipState && (
                  <form action={updateOrderState} className="flex items-center gap-2">
                    <input type="hidden" name="orderId" value={o.id} />
                    <input
                      name="state"
                      placeholder="Missing state — add it"
                      className="rounded-lg border border-amber-400 bg-amber-50 px-2 py-1 text-sm"
                    />
                    <button className="rounded-lg border border-[#2F4A3D]/20 px-3 py-1 text-sm">
                      Save
                    </button>
                  </form>
                )}
              </div>
            </article>
          ))}
        </div>

        {/* ----------------------------------------------------------- leads */}
        <h2 className="mb-3 text-lg font-semibold text-[#2F4A3D]">Membership enquiries</h2>
        <div className="mb-10 space-y-2">
          {leads.length === 0 && <Empty>No enquiries yet.</Empty>}
          {leads.map((l) => (
            <article
              key={l.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#2F4A3D]/10 bg-white p-3"
            >
              <div>
                <p className="text-sm text-[#2F4A3D]">
                  <span className="font-medium">{l.fullName}</span>
                  {l.reference && (
                    <span className="ml-2 rounded bg-[#1E4A35]/10 px-2 py-0.5 text-xs text-[#1E4A35]">
                      {l.reference}
                    </span>
                  )}
                </p>
                <p className="text-sm text-[#2F4A3D]/70">
                  <a className="underline" href={`mailto:${l.email}`}>{l.email}</a>
                  {l.phone && <> &middot; <a className="underline" href={`tel:${l.phone}`}>{l.phone}</a></>}
                  {l.city && <> &middot; {l.city}</>}
                </p>
                <p className="text-xs text-[#2F4A3D]/50">{when(l.createdAt)}</p>
              </div>
              <form action={updateLeadStatus} className="flex items-center gap-2">
                <input type="hidden" name="leadId" value={l.id} />
                <select
                  name="status"
                  defaultValue={l.status}
                  className="rounded-lg border border-[#2F4A3D]/20 bg-white px-2 py-1 text-sm"
                >
                  {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <button className="rounded-lg bg-[#1E4A35] px-3 py-1 text-sm text-[#FBF6EC]">
                  Update
                </button>
              </form>
            </article>
          ))}
        </div>

        {/* -------------------------------------------------------- products */}
        <h2 className="mb-3 text-lg font-semibold text-[#2F4A3D]">Catalogue</h2>
        <div className="overflow-x-auto rounded-xl border border-[#2F4A3D]/10 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-[#2F4A3D]/10 text-left text-[#2F4A3D]/60">
              <tr>
                <th className="p-3">Product</th>
                <th className="p-3">Size</th>
                <th className="p-3 text-right">Price</th>
                <th className="p-3">Active</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-[#2F4A3D]/5 last:border-0">
                  <td className="p-3 text-[#2F4A3D]">{p.name}</td>
                  <td className="p-3 text-[#2F4A3D]/70">{p.sizeLabel ?? '—'}</td>
                  <td className="p-3 text-right text-[#2F4A3D]">{rs(p.pricePaise)}</td>
                  <td className="p-3">{p.isActive ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-8 text-center text-xs text-[#2F4A3D]/50">
          Showing the 100 most recent orders and enquiries.
        </p>
      </div>
    </main>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-[#2F4A3D]/10 bg-white p-4">
      <p className="text-xl font-semibold text-[#1E4A35]">{value}</p>
      <p className="mt-0.5 text-xs text-[#2F4A3D]/70">{label}</p>
      {hint && <p className="text-[0.65rem] text-[#2F4A3D]/45">{hint}</p>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#2F4A3D]/10 bg-white p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#2F4A3D]/60">
        {title}
      </h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ left, right }: { left: React.ReactNode; right: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      {left}
      <span className="text-sm font-medium text-[#2F4A3D]">{right}</span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-[#2F4A3D]/20 bg-white/50 p-6 text-center text-sm text-[#2F4A3D]/60">
      {children}
    </div>
  );
}
