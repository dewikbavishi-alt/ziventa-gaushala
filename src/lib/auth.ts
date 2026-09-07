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
  return prisma.customer.upsert({
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
}

/**
 * The signed-in customer, with their membership and address count loaded.
 * Returns null if nobody is signed in.
 */
export async function getCurrentCustomer() {
  const user = await getCurrentUser();
  if (!user) return null;

  await syncCustomer(user);

  return prisma.customer.findUnique({
    where: { id: user.id },
    include: {
      membership: true,
      _count: { select: { orders: true, addresses: true } },
    },
  });
}
