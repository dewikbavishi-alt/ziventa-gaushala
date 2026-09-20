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
/**
 * Empty string to null.
 *
 * Supabase returns `""` - not null - for a user with no phone, and `??` does
 * not catch an empty string. Both `email` and `phone` are UNIQUE on Customer,
 * so writing `""` means the FIRST phone-less customer takes `""` and every
 * one after them collides on it. Verified against the real database: creating
 * a second customer with an empty phone is refused outright, which would have
 * thrown inside getCurrentCustomer and turned the second customer's account
 * page into a 500.
 *
 * Null is exempt from a unique constraint. Empty string is not.
 */
const orNull = (v: string | null | undefined): string | null => {
  const trimmed = v?.trim();
  return trimmed ? trimmed : null;
};

export async function syncCustomer(user: User) {
  const authPhone = orNull(user.phone);

  const customer = await prisma.customer.upsert({
    where: { id: user.id },
    update: {
      email: orNull(user.email),
      /**
       * Only overwritten when Supabase actually holds a number.
       *
       * This runs on every account page load. Writing null whenever Supabase
       * has none would erase the number the customer just typed into Login &
       * Security the moment they loaded the next page - the save would appear
       * to work and then silently undo itself. Supabase only knows a number
       * for someone who signed in by SMS; for everyone else ours is the only
       * copy, and it is the one to keep.
       */
      ...(authPhone ? { phone: authPhone } : {}),
    },
    create: {
      id: user.id,
      email: orNull(user.email),
      phone: authPhone,
      fullName: orNull(user.user_metadata?.full_name as string | undefined),
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
