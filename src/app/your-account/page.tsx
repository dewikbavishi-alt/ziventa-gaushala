import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentCustomer } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AccountShell } from '@/components/account/account-shell';
import { OrderProgress } from '@/components/account/order-progress';
import { StatusBadge, rs, when } from '@/components/account/order-status';
import {
  AccountCard,
  AddressIcon,
  ContactIcon,
  MembershipIcon,
  OrdersIcon,
  SecurityIcon,
} from '@/components/account/account-card';

export const metadata: Metadata = {
  title: 'Your account',
  description: 'Your Ziventa Gaushala orders, addresses and Gir Gold Club membership.',
};

/** Two letters for the avatar. Falls back through name, email, then nothing. */
function initials(name?: string | null, email?: string | null): string {
  const from = name?.trim() || email?.split('@')[0] || '';
  const words = from.split(/[\s._-]+/).filter(Boolean);
  if (words.length === 0) return '·';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

const monthYear = (d: Date) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    month: 'long',
    year: 'numeric',
  }).format(d);

/**
 * The account hub.
 *
 * Opens with the one thing somebody almost always came for - where their last
 * order has got to - and only then offers the cards. Checking an order was
 * previously two taps and a page load away; now the answer is on the screen
 * they land on, and the cards are still there for everything else.
 *
 * There is no Payment Options card. The reference has one, but this site takes
 * no payments yet, and a card leading to an empty page is worse than no card.
 */
export default async function YourAccountPage() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect('/login?next=%2Fyour-account');

  /**
   * Totalled by the database, not by summing `customer.orders`.
   *
   * That list is capped at the 20 most recent, so a long-standing customer
   * would be shown a total quietly missing everything older - a wrong number
   * presented as a fact. Cancelled and failed orders are excluded and refunds
   * subtracted, matching how the admin dashboard counts revenue, so the two
   * can never disagree about the same customer.
   */
  const totals = await prisma.order.aggregate({
    where: {
      customerId: customer.id,
      status: { not: 'CANCELLED' },
      paymentStatus: { not: 'FAILED' },
    },
    _sum: { totalPaise: true, refundedPaise: true },
  });
  const netPaise = (totals._sum.totalPaise ?? 0) - (totals._sum.refundedPaise ?? 0);

  const name = customer.fullName?.trim();
  const seat = customer.membership?.seatNumber;
  const orderCount = customer._count.orders;
  const addressCount = customer._count.addresses;
  const latest = customer.orders[0];

  return (
    <AccountShell
      title={name ? `Welcome back, ${name.split(' ')[0]}` : 'Your Account'}
      description={`Signed in as ${customer.email ?? customer.phone ?? 'your account'}`}
      hero={
        <section className="mb-6 overflow-hidden rounded-3xl border border-[#2F4A3D]/12 bg-gradient-to-br from-[#1E4A35] to-[#2F4A3D] text-[#FBF6EC]">
          <div className="flex flex-wrap items-center gap-4 px-6 pt-6 pb-5">
            <span
              aria-hidden="true"
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#C08A2E] font-display text-xl text-white"
            >
              {initials(name, customer.email)}
            </span>
            <div className="min-w-0">
              <p className="font-display text-lg break-words">{name ?? customer.email}</p>
              <p className="text-sm text-[#FBF6EC]/65">
                With us since {monthYear(customer.createdAt)}
              </p>
            </div>
          </div>

          {/* Three figures, each one a link to the page that explains it. */}
          <dl className="grid grid-cols-3 gap-px border-t border-white/10 bg-white/10">
            <Link
              href="/your-account/orders"
              className="bg-[#26543E] px-3 py-4 text-center transition hover:bg-[#2c6048] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#C08A2E]"
            >
              <dt className="text-[0.7rem] tracking-wide text-[#FBF6EC]/60 uppercase">Orders</dt>
              <dd className="mt-1 font-display text-xl">{orderCount}</dd>
            </Link>
            <Link
              href="/your-account/orders"
              className="bg-[#26543E] px-3 py-4 text-center transition hover:bg-[#2c6048] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#C08A2E]"
            >
              <dt className="text-[0.7rem] tracking-wide text-[#FBF6EC]/60 uppercase">
                Total ordered
              </dt>
              <dd className="mt-1 font-display text-xl">{rs(netPaise)}</dd>
            </Link>
            <Link
              href="/your-account/membership"
              className="bg-[#26543E] px-3 py-4 text-center transition hover:bg-[#2c6048] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#C08A2E]"
            >
              <dt className="text-[0.7rem] tracking-wide text-[#FBF6EC]/60 uppercase">Gold Club</dt>
              <dd className="mt-1 font-display text-xl">
                {seat ? `Seat ${seat}` : <span className="text-base text-[#FBF6EC]/70">—</span>}
              </dd>
            </Link>
          </dl>
        </section>
      }
    >
      {/* ---- the last order, if there is one ---- */}
      {latest ? (
        <section className="mb-6 rounded-2xl border border-[#2F4A3D]/12 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[0.7rem] tracking-wide text-[#2F4A3D]/55 uppercase">
                Your latest order
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h2 className="font-semibold text-[#2F4A3D]">{latest.orderNumber}</h2>
                <StatusBadge status={latest.status} />
              </div>
              <p className="mt-0.5 text-xs text-[#2F4A3D]/55">
                Placed {when(latest.placedAt)} &middot; {rs(latest.totalPaise)}
              </p>
            </div>
            <Link
              href="/your-account/orders"
              className="rounded-lg border border-[#2F4A3D]/20 px-3 py-1.5 text-xs font-medium text-[#2F4A3D] transition hover:border-[#C08A2E]/60 hover:bg-[#FBF6EC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E4A35]"
            >
              All orders
            </Link>
          </div>

          <div className="mt-6">
            <OrderProgress
              status={latest.status}
              placedAt={latest.placedAt}
              confirmedAt={latest.confirmedAt}
              dispatchedAt={latest.dispatchedAt}
              deliveredAt={latest.deliveredAt}
            />
          </div>

          {latest.trackingNumber && (
            <p className="mt-4 rounded-xl bg-[#FBF6EC] px-3 py-2 text-sm text-[#2F4A3D]/80">
              {latest.courier ?? 'Courier'} tracking:{' '}
              <span className="font-medium text-[#2F4A3D]">{latest.trackingNumber}</span>
            </p>
          )}
        </section>
      ) : (
        <section className="mb-6 rounded-2xl border border-dashed border-[#2F4A3D]/25 bg-white/60 p-8 text-center">
          <p className="text-[#2F4A3D]">No orders yet.</p>
          <p className="mt-1 text-sm text-[#2F4A3D]/65">
            Anything you ordered as a guest with this email will appear here on its own.
          </p>
          <a
            href="/#shop"
            className="mt-5 inline-block rounded-lg bg-[#1E4A35] px-5 py-2.5 text-sm font-medium text-[#FBF6EC] transition hover:bg-[#173a29] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E4A35]"
          >
            Browse the shop
          </a>
        </section>
      )}

      {/* ---- everything else ---- */}
      <h2 className="mb-3 text-[0.7rem] tracking-wide text-[#2F4A3D]/55 uppercase">Manage</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AccountCard
          href="/your-account/orders"
          title="Your Orders"
          description="Track an order or buy something again"
          icon={<OrdersIcon />}
          badge={orderCount > 0 ? String(orderCount) : undefined}
        />

        <AccountCard
          href="/your-account/security"
          title="Login &amp; Security"
          description="Edit your name and mobile number"
          icon={<SecurityIcon />}
        />

        <AccountCard
          href="/your-account/membership"
          title="Gir Gold Club"
          description="Your founding membership and deposit"
          icon={<MembershipIcon />}
          badge={seat ? `Seat ${seat}` : undefined}
        />

        <AccountCard
          href="/your-account/addresses"
          title="Your Addresses"
          description="Addresses used for your deliveries"
          icon={<AddressIcon />}
          badge={addressCount > 0 ? String(addressCount) : undefined}
        />

        <AccountCard
          href="mailto:hello@ziventagaushala.com"
          external
          title="Contact Us"
          description="Speak to us about an order or your membership"
          icon={<ContactIcon />}
        />
      </div>
    </AccountShell>
  );
}
