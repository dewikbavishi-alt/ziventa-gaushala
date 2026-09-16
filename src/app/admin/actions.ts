'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/admin';

/**
 * Every action here calls requireAdmin() FIRST.
 *
 * Next's docs are explicit that Server Functions can be invoked by a direct
 * POST, not only by the button that renders them - so protecting the page is
 * not enough. Each one re-checks on its own.
 */

const ORDER_STATUSES = [
  'PENDING', 'PAID', 'FAILED', 'CANCELLED', 'SHIPPED', 'DELIVERED', 'REFUNDED',
] as const;

const LEAD_STATUSES = ['new', 'contacted', 'converted', 'declined'] as const;

export async function updateOrderStatus(formData: FormData) {
  await requireAdmin();

  const parsed = z
    .object({
      orderId: z.string().uuid(),
      status: z.enum(ORDER_STATUSES),
    })
    .safeParse({
      orderId: formData.get('orderId'),
      status: formData.get('status'),
    });

  if (!parsed.success) throw new Error('Invalid order update');

  await prisma.order.update({
    where: { id: parsed.data.orderId },
    data: { status: parsed.data.status },
  });

  revalidatePath('/admin');
}

export async function updateLeadStatus(formData: FormData) {
  await requireAdmin();

  const parsed = z
    .object({
      leadId: z.string().uuid(),
      status: z.enum(LEAD_STATUSES),
    })
    .safeParse({
      leadId: formData.get('leadId'),
      status: formData.get('status'),
    });

  if (!parsed.success) throw new Error('Invalid lead update');

  await prisma.lead.update({
    where: { id: parsed.data.leadId },
    data: { status: parsed.data.status },
  });

  revalidatePath('/admin');
}

/** Fill in a state on an order placed before the checkout asked for one. */
export async function updateOrderState(formData: FormData) {
  await requireAdmin();

  const parsed = z
    .object({
      orderId: z.string().uuid(),
      state: z.string().trim().min(2).max(120),
    })
    .safeParse({
      orderId: formData.get('orderId'),
      state: formData.get('state'),
    });

  if (!parsed.success) throw new Error('Invalid state');

  await prisma.order.update({
    where: { id: parsed.data.orderId },
    data: { shipState: parsed.data.state },
  });

  revalidatePath('/admin');
}
