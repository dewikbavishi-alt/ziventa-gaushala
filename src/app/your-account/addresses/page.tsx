import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentCustomer } from '@/lib/auth';
import { AccountShell } from '@/components/account/account-shell';

export const metadata: Metadata = { title: 'Your addresses' };

export default async function AddressesPage() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect('/login?next=%2Fyour-account%2Faddresses');

  return (
    <AccountShell
      title="Your Addresses"
      description="Addresses we deliver your orders to."
      backHref="/your-account"
      backLabel="Your Account"
    >
      {customer.addresses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#2F4A3D]/25 bg-white/60 p-10 text-center">
          <p className="text-[#2F4A3D]">You have no saved addresses yet.</p>
          {/*
            Honest about why. Checkout collects an address per order and does
            not yet save it to the account, so telling someone to "add an
            address" here would send them looking for a button that does not
            exist.
          */}
          <p className="mx-auto mt-2 max-w-md text-sm text-[#2F4A3D]/65">
            The address you type at checkout is used for that order. Saved addresses, so you can
            reuse one in a tap, are coming soon.
          </p>
          <a
            href="/#shop"
            className="mt-5 inline-block rounded-lg bg-[#1E4A35] px-5 py-2.5 text-sm font-medium text-[#FBF6EC] transition hover:bg-[#173a29] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E4A35]"
          >
            Browse the shop
          </a>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {customer.addresses.map((a) => (
            <article
              key={a.id}
              className="rounded-2xl border border-[#2F4A3D]/12 bg-white p-5 text-sm text-[#2F4A3D]/85"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {a.label && <h2 className="font-semibold text-[#2F4A3D]">{a.label}</h2>}
                {a.isDefault && (
                  <span className="rounded bg-[#1E4A35]/10 px-2 py-0.5 text-xs font-medium text-[#1E4A35]">
                    Default
                  </span>
                )}
              </div>
              <address className="not-italic leading-relaxed">
                {[a.line1, a.line2, a.city, a.state, a.postcode].filter(Boolean).join(', ')}
              </address>
            </article>
          ))}
        </div>
      )}
    </AccountShell>
  );
}
