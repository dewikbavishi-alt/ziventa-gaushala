'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/supabase/server';

const idSchema = z.object({ addressId: z.string().uuid() });

export type AddressResult = { ok: boolean; message: string };

/**
 * Both actions below take the address id from the form but NEVER the owner.
 *
 * A Server Function is reachable by a direct POST, not only through the button
 * that renders it, so the customerId has to come from the verified session.
 * The id is then only useful against your own addresses: every write is
 * filtered by customerId as well, so a guessed uuid belonging to somebody else
 * matches zero rows and changes nothing.
 */
async function ownedAddress(addressId: string) {
  const user = await getCurrentUser();
  if (!user) return null;

  const address = await prisma.address.findFirst({
    where: { id: addressId, customerId: user.id },
    select: { id: true, customerId: true, isDefault: true },
  });

  return address;
}

/** Make one address the one offered back at checkout. */
export async function setDefaultAddress(
  _prev: AddressResult | null,
  formData: FormData,
): Promise<AddressResult> {
  const parsed = idSchema.safeParse({ addressId: formData.get('addressId') });
  if (!parsed.success) return { ok: false, message: 'That address could not be found.' };

  const address = await ownedAddress(parsed.data.addressId);
  if (!address) return { ok: false, message: 'That address could not be found.' };

  /**
   * Clearing the old default and setting the new one happen together. Done as
   * two statements, a failure between them leaves an account with either two
   * defaults or none, and checkout would then have to guess.
   */
  await prisma.$transaction([
    prisma.address.updateMany({
      where: { customerId: address.customerId, isDefault: true },
      data: { isDefault: false },
    }),
    prisma.address.update({ where: { id: address.id }, data: { isDefault: true } }),
  ]);

  revalidatePath('/your-account/addresses');
  return { ok: true, message: 'Saved. We will use this one next time.' };
}

/** Remove an address from the account. */
export async function deleteAddress(
  _prev: AddressResult | null,
  formData: FormData,
): Promise<AddressResult> {
  const parsed = idSchema.safeParse({ addressId: formData.get('addressId') });
  if (!parsed.success) return { ok: false, message: 'That address could not be found.' };

  const address = await ownedAddress(parsed.data.addressId);
  if (!address) return { ok: false, message: 'That address could not be found.' };

  /**
   * Orders that were delivered here are NOT touched. Order.addressId is
   * onDelete: SetNull and every order keeps its own copy of the address in
   * its ship* fields, so past orders still show where they went. Deleting
   * here means "stop offering me this", not "erase where you sent my ghee".
   */
  await prisma.address.delete({ where: { id: address.id } });

  /**
   * If the default was the one removed, promote the newest survivor rather
   * than leaving the account with none - otherwise checkout quietly stops
   * pre-filling and it looks like the feature broke.
   */
  if (address.isDefault) {
    const next = await prisma.address.findFirst({
      where: { customerId: address.customerId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (next) {
      await prisma.address.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  }

  revalidatePath('/your-account/addresses');
  return { ok: true, message: 'Address removed.' };
}
