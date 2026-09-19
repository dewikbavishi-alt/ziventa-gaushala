import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentCustomer } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Your account',
  description: 'Your Ziventa Gaushala orders, addresses and membership.',
};

/**
 * Never prerender this page. It shows one specific person's orders and seat
 * number, so a build-time snapshot would be wrong for everyone.
 *
 * It also has to be stated explicitly. Next normally works this out by itself
 * when a page reads cookies, but that only happens once `cookies()` is
 * actually called - and everything above it runs during the build first. A
 * missing Supabase variable therefore threw while the BUILD was rendering
 * this page, and took the whole deployment down with it.
 */
export const dynamic = 'force-dynamic';

const rs = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const when = (d: Date) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);

/** What each status means to a customer, rather than to the database. */
const STATUS_TEXT: Record<string, string> = {
  PENDING: 'Awaiting confirmation',
  PAID: 'Paid',
  SHIPPED: 'On its way',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
  FAILED: 'Payment failed',
};

const STATUS_COLOUR: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  PAID: 'bg-emerald-100 text-emerald-800',
  SHIPPED: 'bg-sky-100 text-sky-800',
  DELIVERED: 'bg-emerald-100 text-emerald-900',
  CANCELLED: 'bg-stone-200 text-stone-700',
  REFUNDED: 'bg-stone-200 text-stone-700',
  FAILED: 'bg-red-100 text-red-800',
};

/**
 * The signed-in area.
 *
 * The check happens here, next to the data - not in proxy.ts. Proxy runs
 * before the route and is easy to slip past, so it refreshes the session but
 * never decides who is allowed in.
 */
export default async function YourAccountPage() {
  const customer = await getCurrentCustomer();

  if (!customer) {
    redirect('/login');
  }

  const seat = customer.membership?.seatNumber;
  const name = customer.fullName?.trim();

  return (
    <main className="min-h-screen bg-[#FBF6EC] px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-[#2F4A3D]">
              {name ? `Welcome back, ${name}` : 'Your account'}
            </h1>
            <p className="mt-1 text-sm text-[#2F4A3D]/70">
              {customer.email ?? customer.phone ?? 'Signed in'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/"
              className="rounded-lg border border-[#2F4A3D]/20 bg-white px-3 py-1.5 text-sm text-[#2F4A3D] transition hover:bg-[#FBF6EC]"
            >
              Shop
            </a>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-lg border border-[#2F4A3D]/20 bg-white px-3 py-1.5 text-sm text-[#2F4A3D] transition hover:bg-[#FBF6EC]"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        <section className="mb-6 grid grid-cols-3 gap-3">
          <Stat label="Orders" value={String(customer._count.orders)} />
          <Stat label="Saved addresses" value={String(customer._count.addresses)} />
          <Stat label="Gir Gold Club" value={seat ? `Seat ${seat}` : 'Not yet'} />
        </section>

        {/* ------------------------------------------------- membership */}
        <section className="mb-8 rounded-2xl border border-[#2F4A3D]/10 bg-white p-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#2F4A3D]/60">
            Gir Gold Club
          </h2>
          {seat ? (
            <div>
              <p className="text-3xl font-semibold text-[#1E4A35]">Seat {seat}</p>
              <p className="mt-1 text-sm text-[#2F4A3D]/70">
                Status: {customer.membership?.status.toLowerCase()} &middot; Deposit:{' '}
                {customer.membership?.depositStatus.toLowerCase()}
              </p>
            </div>
          ) : (
            <div>
              <p className="text-[#2F4A3D]">You are not a member yet.</p>
              <p className="mt-1 text-sm text-[#2F4A3D]/70">
                Founding membership is limited to 250 families.
              </p>
              <a
                href="/#join"
                className="mt-3 inline-block rounded-lg bg-[#1E4A35] px-4 py-2 text-sm font-medium text-[#FBF6EC] transition hover:bg-[#173a29]"
              >
                Reserve a place
              </a>
            </div>
          )}
        </section>

        {/* ----------------------------------------------------- orders */}
        <h2 className="mb-3 text-lg font-semibold text-[#2F4A3D]">Your orders</h2>

        {customer.orders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#2F4A3D]/20 bg-white/50 p-8 text-center">
            <p className="text-[#2F4A3D]">You have not ordered anything yet.</p>
            <a
              href="/#shop"
              className="mt-4 inline-block rounded-lg bg-[#1E4A35] px-4 py-2 text-sm font-medium text-[#FBF6EC] transition hover:bg-[#173a29]"
            >
              Browse the shop
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            {customer.orders.map((o) => (
              <article
                key={o.id}
                className="rounded-2xl border border-[#2F4A3D]/10 bg-white p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[#2F4A3D]">{o.orderNumber}</span>
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

                <p className="mt-3 border-t border-[#2F4A3D]/10 pt-2 text-xs text-[#2F4A3D]/60">
                  Delivering to{' '}
                  {[o.shipLine1, o.shipLine2, o.shipCity, o.shipState, o.shipPostcode]
                    .filter(Boolean)
                    .join(', ')}
                </p>
              </article>
            ))}

            {customer._count.orders > customer.orders.length && (
              <p className="pt-1 text-center text-xs text-[#2F4A3D]/55">
                Showing your {customer.orders.length} most recent orders of{' '}
                {customer._count.orders}.
              </p>
            )}
          </div>
        )}

        {/* -------------------------------------------------- addresses */}
        {customer.addresses.length > 0 && (
          <>
            <h2 className="mb-3 mt-10 text-lg font-semibold text-[#2F4A3D]">Saved addresses</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {customer.addresses.map((a) => (
                <div
                  key={a.id}
                  className="rounded-2xl border border-[#2F4A3D]/10 bg-white p-4 text-sm text-[#2F4A3D]/80"
                >
                  {a.isDefault && (
                    <span className="mb-1 inline-block rounded bg-[#1E4A35]/10 px-2 py-0.5 text-xs text-[#1E4A35]">
                      Default
                    </span>
                  )}
                  <p>
                    {[a.line1, a.line2, a.city, a.state, a.postcode].filter(Boolean).join(', ')}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#2F4A3D]/10 bg-white p-4 text-center">
      <p className="text-xl font-semibold text-[#1E4A35]">{value}</p>
      <p className="mt-0.5 text-xs text-[#2F4A3D]/70">{label}</p>
    </div>
  );
}
