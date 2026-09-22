'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/admin';
import { LEAD_STATUSES } from '@/lib/admin/status';
import type { ActionResult } from '@/components/admin/action-form';

/** Move a Gir Gold Club enquiry along: new, contacted, converted, declined. */
export async function updateLeadStatus(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, message: 'You are no longer signed in as an admin.' };
  }

  const parsed = z
    .object({ leadId: z.string().uuid(), status: z.enum(LEAD_STATUSES) })
    .safeParse({ leadId: formData.get('leadId'), status: formData.get('status') });
  if (!parsed.success) return { ok: false, message: 'That update was not valid.' };

  const lead = await prisma.lead.update({
    where: { id: parsed.data.leadId },
    data: { status: parsed.data.status },
    select: { fullName: true },
  });

  revalidatePath('/admin/membership');
  return { ok: true, message: `${lead.fullName} marked ${parsed.data.status}.` };
}
