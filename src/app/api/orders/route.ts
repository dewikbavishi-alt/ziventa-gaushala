import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { CartError, generateOrderNumber, priceCart } from '@/lib/orders';
import { getCurrentUser } from '@/lib/supabase/server';
import { syncCustomer } from '@/lib/auth';
import { businessOrderEmail, customerOrderEmail, sendEmail } from '@/lib/email';

const orderSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(200),
    phone: z.string().trim().min(6).max(30),
  }),
  address: z.object({
    line1: z.string().trim().min(3).max(200),
    line2: z.string().trim().max(200).optional().or(z.literal('')),
    city: z.string().trim().min(2).max(120),
    // Required. GST and courier rate cards both key on the state, and the
    // first four orders were saved without one - which is why this is now
    // enforced here and not only in the browser.
    state: z.string().trim().min(2, 'Please select your state').max(120),
    postcode: z
      .string()
      .trim()
      .regex(/^\d{6}$/, 'Enter a 6-digit PIN code'),
    country: z.string().trim().length(2).default('IN'),
  }),
  /** Only ids and quantities. Deliberately no price field to tamper with. */
  items: z
    .array(
      z.object({
        slug: z.string().trim().min(1).max(120),
        quantity: z.number().int().min(1).max(50),
      }),
    )
    .min(1, 'Your cart is empty')
    .max(40),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const parsed = orderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Please check your details',
        issues: parsed.error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      },
      { status: 422 },
    );
  }
  const input = parsed.data;

  // Prices always come from the database, never from the request.
  let cart;
  try {
    cart = await priceCart(input.items);
  } catch (err) {
    if (err instanceof CartError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  // Attach the order to an account if the person happens to be signed in.
  // Guest checkout still works - customerId is nullable.
  let customerId: string | null = null;
  const user = await getCurrentUser();
  if (user) {
    await syncCustomer(user);
    customerId = user.id;
  }

  const order = await prisma.order.create({
    data: {
      orderNumber: generateOrderNumber(),
      customerId,
      contactName: input.customer.name,
      contactEmail: input.customer.email.toLowerCase(),
      contactPhone: input.customer.phone,
      shipLine1: input.address.line1,
      shipLine2: input.address.line2 || null,
      shipCity: input.address.city,
      shipState: input.address.state,
      shipPostcode: input.address.postcode,
      shipCountry: input.address.country,
      subtotalPaise: cart.subtotalPaise,
      shippingPaise: cart.shippingPaise,
      totalPaise: cart.totalPaise,
      notes: input.notes || null,
      items: { create: cart.items },
    },
    include: { items: true },
  });

  /**
   * The order is committed before any email is attempted. Email is a
   * notification, not part of the sale - a mail outage must never cost a
   * customer their order or show them an error for something that worked.
   */
  const emailData = {
    orderNumber: order.orderNumber,
    contactName: order.contactName,
    contactEmail: order.contactEmail,
    contactPhone: order.contactPhone,
    shipLine1: order.shipLine1,
    shipLine2: order.shipLine2,
    shipCity: order.shipCity,
    shipState: order.shipState,
    shipPostcode: order.shipPostcode,
    subtotalPaise: order.subtotalPaise,
    shippingPaise: order.shippingPaise,
    totalPaise: order.totalPaise,
    notes: order.notes,
    items: order.items.map((i) => ({
      productName: i.productName,
      unitPricePaise: i.unitPricePaise,
      quantity: i.quantity,
    })),
  };

  const [toCustomer, toBusiness] = await Promise.all([
    sendEmail(customerOrderEmail(emailData)),
    sendEmail(businessOrderEmail(emailData)),
  ]);

  if (!toBusiness.delivered) {
    console.warn(`[order ${order.orderNumber}] alert not sent: ${toBusiness.reason}`);
  }

  return NextResponse.json(
    {
      ok: true,
      orderNumber: order.orderNumber,
      amountPaise: order.totalPaise,
      confirmationSent: toCustomer.delivered,
      // No payment gateway connected yet, so nothing is charged.
      payment: { provider: 'none' },
    },
    { status: 201 },
  );
}
