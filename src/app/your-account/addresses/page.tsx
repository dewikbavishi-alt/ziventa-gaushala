import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentCustomer } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AccountShell } from '@/components/account/account-shell';
import { AddressCard } from './address-card';

export const metadata: Metadata = { title: 'Your addresses' };

/** The saved list changes as soon as an order is placed, so never cached. */
export const dynamic = 'force-dynamic';

export default async function AddressesPage() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect('/login?next=%2Fyour-account%2Faddresses');

  /**
   * How many orders went to each address, for the "Used for 3 orders" line.
   *
   * Counted here rather than included on the customer, because the answer is
   * one number per address and pulling every order back to length() them in
   * the page would grow with the account.
   */
  const usage = await prisma.order.groupBy({
    by: ['addressId'],
    where: { customerId: customer.id, addressId: { not: null } },
    _count: { _all: true },
  });
  const ordersByAddress = new Map(usage.map((u) => [u.addressId!, u._count._all]));

  /** Default first, then newest - the order someone scanning the page expects. */
  const addresses = [...customer.addresses].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return (
    <AccountShell
      title="Your Addresses"
      description="Addresses we deliver your orders to."
      backHref="/your-account"
      backLabel="Your Account"
    >
      {addresses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#2F4A3D]/25 bg-white/60 p-10 text-center">
          <p className="text-[#2F4A3D]">You have no saved addresses yet.</p>
          {/*
            No "add an address" button on purpose. There is nothing to deliver
            to an address that exists on its own, and a second place to type
            one is a second place for it to fall out of date. Ordering is what
            saves one, and from then on checkout fills itself in.
          */}
          <p className="mx-auto mt-2 max-w-md text-sm text-[#2F4A3D]/65">
            The address you type at checkout is saved here automatically, so your next order
            fills itself in. Nothing to set up.
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
          <p className="mb-4 text-sm text-[#2F4A3D]/65">
            Saved from your orders. The default one fills in your next checkout — you can still
            change it there.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {addresses.map((a) => (
              <AddressCard
                key={a.id}
                id={a.id}
                label={a.label}
                isDefault={a.isDefault}
                lines={[a.line1, a.line2, a.city, a.state, a.postcode].filter(Boolean).join(', ')}
                usedByOrders={ordersByAddress.get(a.id) ?? 0}
              />
            ))}
          </div>
        </>
      )}
    </AccountShell>
  );
}
