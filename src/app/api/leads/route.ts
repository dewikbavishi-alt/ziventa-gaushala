import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

/** What the "Reserve Your Membership" form on the landing page sends. */
const leadSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name').max(120),
  email: z.string().trim().email('Please enter a valid email address').max(200),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  city: z.string().trim().max(120).optional().or(z.literal('')),
  message: z.string().trim().max(2000).optional().or(z.literal('')),
  /**
   * Honeypot. A real person never fills a field they cannot see. Any value is
   * accepted by the schema on purpose - rejecting it here with a 422 would
   * tell a bot exactly which field caught it.
   */
  company: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const parsed = leadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Please check the form',
        issues: parsed.error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      },
      { status: 422 },
    );
  }

  const { company, ...data } = parsed.data;

  // Quietly accept and drop it, so the bot learns nothing.
  if (company) return NextResponse.json({ ok: true }, { status: 201 });

  const lead = await prisma.lead.create({
    data: {
      fullName: data.name,
      email: data.email.toLowerCase(),
      phone: data.phone || null,
      city: data.city || null,
      message: data.message || null,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      id: lead.id,
      // The page words its success message from this, so it never claims an
      // email was sent when none was. Email sending is not wired up yet.
      confirmationSent: false,
    },
    { status: 201 },
  );
}
