import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentCustomer } from '@/lib/auth';
import { AccountShell } from '@/components/account/account-shell';
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

/**
 * The account hub.
 *
 * A grid of cards rather than a dashboard of figures: someone arriving here
 * has come to do one particular thing - check an order, change their number -
 * and a card that says what it is for gets them there faster than a wall of
 * statistics they did not ask for.
 *
 * There is no Payment Options card. The reference has one, but this site
 * takes no payments yet, and a card leading to an empty page is worse than no
 * card at all.
 */
export default async function YourAccountPage() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect('/login?next=%2Fyour-account');

  const name = customer.fullName?.trim();
  const seat = customer.membership?.seatNumber;
  const orderCount = customer._count.orders;
  const addressCount = customer._count.addresses;

  return (
    <AccountShell
      title="Your Account"
      description={
        name
          ? `Signed in as ${name} (${customer.email ?? customer.phone ?? ''})`
          : `Signed in as ${customer.email ?? customer.phone ?? 'your account'}`
      }
    >
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
