'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/admin';
import type { ActionResult } from '@/components/admin/action-form';

/**
 * Set a product's stock level, low-stock threshold and visibility.
 *
 * An empty stock box means "do not track this product" (null), which is
 * different from zero - zero means sold out. The difference matters: an
 * untracked product can always be sold, a zero-stock one should not be.
 */
export async function updateStock(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, message: 'You are no longer signed in as an admin.' };
  }

  const stockRaw = String(formData.get('stockCount') ?? '').trim();

  const parsed = z
    .object({
      productId: z.string().uuid(),
      // The database also refuses negatives, so this is belt and braces.
      stockCount: z.union([z.literal(''), z.coerce.number().int().min(0).max(1_000_000)]),
      lowStockThreshold: z.coerce.number().int().min(0).max(100_000),
      isActive: z.enum(['on']).optional(),
    })
    .safeParse({
      productId: formData.get('productId'),
      stockCount: stockRaw,
      lowStockThreshold: formData.get('lowStockThreshold'),
      isActive: formData.get('isActive') ?? undefined,
    });

  if (!parsed.success) {
    return { ok: false, message: 'Stock must be a whole number of 0 or more, or left blank.' };
  }

  const p = await prisma.product.update({
    where: { id: parsed.data.productId },
    data: {
      stockCount: parsed.data.stockCount === '' ? null : parsed.data.stockCount,
      lowStockThreshold: parsed.data.lowStockThreshold,
      isActive: parsed.data.isActive === 'on',
    },
    select: { name: true },
  });

  revalidatePath('/admin', 'layout');
  return { ok: true, message: `${p.name} updated.` };
}
