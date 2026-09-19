import type { User } from '@supabase/supabase-js';
import { prisma } from './prisma';
import { getCurrentUser } from './supabase/server';

/**
 * Copy a Supabase user into our own customers table.
 *
 * Supabase keeps the login details (password, phone, OTP codes). We keep the
 * business data (orders, membership, addresses). This joins the two by using
 * the same id in both places.
 *
 * Safe to call on every page load - it updates rather than duplicates.
 */
export async function syncCustomer(user: User) {
  const customer = await prisma.customer.upsert({
    where: { id: user.id },
    update: {
      email: user.email ?? null,
      phone: user.phone ?? null,
    },
    create: {
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
      fullName: (user.user_metadata?.full_name as string | undefined) ?? null,
    },
  });

  /**
   * Claim any orders placed as a guest with this address.
   *
   * Checkout does not require an account, so most orders arrive with
   * customerId null and only contactEmail to identify them. Without this a
   * customer who ordered last month, then created an account, signs in to an
   * empty account page and reasonably concludes their order has been lost.
   *
   * Safe to match on email because Supabase has just proved they control it -
   * they either opened a link sent to that address or knew its password. It
   * is also why this runs on every sign-in rather than only at creation: an
   * order placed as a guest AFTER the account existed needs claiming too.
   *
   * Only ever fills in a null. An order already belonging to someone else is
   * untouched, so this can never move an order between accounts.
   */
  if (user.email) {
    await prisma.order.updateMany({
      where: { contactEmail: user.email.toLowerCase(), customerId: null },
      data: { customerId: user.id },
    });
  }

  return customer;
}

/**
 * The signed-in customer, with everything their account page shows.
 *
 * Orders are limited to the most recent 20 with their items. A customer with
 * hundreds of orders should not have all of them loaded to render one page,
 * and nobody scrolls past twenty looking for a recent delivery - the total
 * count next to them says how many there are in all.
 */
export async function getCurrentCustomer() {
  const user = await getCurrentUser();
  if (!user) return null;

  await syncCustomer(user);

  return prisma.customer.findUnique({
    where: { id: user.id },
    include: {
      membership: true,
      orders: {
        orderBy: { placedAt: 'desc' },
        take: 20,
        include: { items: true },
      },
      addresses: { orderBy: { createdAt: 'desc' } },
      _count: { select: { orders: true, addresses: true } },
    },
  });
}
