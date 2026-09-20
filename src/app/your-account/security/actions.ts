'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/supabase/server';

const schema = z.object({
  fullName: z.string().trim().max(120).optional().or(z.literal('')),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
});

export type ProfileResult = { ok: boolean; message: string };

/**
 * Update the signed-in customer's own name and mobile number.
 *
 * The id comes from the verified session, never from the form. A Server
 * Function is reachable by a direct POST - not only through the button that
 * renders it - so a hidden customerId field would be an invitation to edit
 * somebody else's account by changing it.
 */
export async function updateProfile(
  _prev: ProfileResult | null,
  formData: FormData,
): Promise<ProfileResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: 'Please sign in again.' };

  const parsed = schema.safeParse({
    fullName: formData.get('fullName'),
    phone: formData.get('phone'),
  });

  if (!parsed.success) {
    return { ok: false, message: 'Please check what you entered.' };
  }

  const fullName = parsed.data.fullName?.trim() || null;
  const phone = parsed.data.phone?.trim() || null;

  if (phone && phone.replace(/\D/g, '').length < 10) {
    return { ok: false, message: 'Please enter a mobile number with at least 10 digits.' };
  }

  try {
    await prisma.customer.update({
      where: { id: user.id },
      data: { fullName, phone },
    });
  } catch (err) {
    // phone is unique across customers, so a number someone else already has
    // comes back as a constraint violation rather than anything friendlier.
    const message = (err as Error).message;
    if (message.includes('Unique constraint') || message.includes('customers_phone_key')) {
      return { ok: false, message: 'That mobile number is already used by another account.' };
    }
    console.error(`[profile] update failed for ${user.id}: ${message}`);
    return { ok: false, message: 'We could not save that just now. Please try again.' };
  }

  // The hub greets them by name, so it has to be refreshed too.
  revalidatePath('/your-account');
  revalidatePath('/your-account/security');

  return { ok: true, message: 'Saved.' };
}
