/**
 * Sending email.
 *
 * Uses Resend over plain fetch - no SDK. Two REST calls do not justify another
 * dependency that has to work identically on a laptop and in a serverless
 * function.
 *
 * If RESEND_API_KEY is missing, nothing breaks: the message is logged and the
 * caller is told it was not delivered. That way the site works before email is
 * set up, and no order is ever lost because a mail server was down.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}

export interface EmailResult {
  delivered: boolean;
  reason?: string;
}

function fromAddress(): string {
  // Resend's shared sender works without a verified domain, but can only
  // deliver to the address that owns the Resend account. Set MAIL_FROM to
  // your own domain once it is verified.
  return process.env.MAIL_FROM ?? 'Ziventa Gaushala <onboarding@resend.dev>';
}

/** Where order and enquiry alerts go. */
export function businessInbox(): string {
  return process.env.MAIL_TO ?? 'dewikbavishi4@gmail.com';
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log(
      `[email:not-configured] to=${message.to} subject=${JSON.stringify(message.subject)}`,
    );
    return { delivered: false, reason: 'RESEND_API_KEY is not set; logged only' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return { delivered: false, reason: `Resend returned ${res.status}: ${detail.slice(0, 200)}` };
    }
    return { delivered: true };
  } catch (err) {
    return { delivered: false, reason: (err as Error).message };
  }
}

/** Rupees from paise, for humans. */
export const rupees = (paise: number) =>
  `Rs ${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ------------------------------------------------------------------ orders

export interface OrderEmailData {
  orderNumber: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  shipLine1: string;
  shipLine2?: string | null;
  shipCity: string;
  shipState?: string | null;
  shipPostcode: string;
  subtotalPaise: number;
  shippingPaise: number;
  totalPaise: number;
  notes?: string | null;
  items: { productName: string; unitPricePaise: number; quantity: number }[];
}

function orderLines(order: OrderEmailData): string {
  return order.items
    .map(
      (i) =>
        `  ${i.quantity} x ${i.productName} - ${rupees(i.unitPricePaise * i.quantity)}`,
    )
    .join('\n');
}

function addressBlock(order: OrderEmailData): string {
  return [order.shipLine1, order.shipLine2, order.shipCity, order.shipState, order.shipPostcode]
    .filter(Boolean)
    .join(', ');
}

/** Sent to the customer. */
export function customerOrderEmail(order: OrderEmailData): EmailMessage {
  return {
    to: order.contactEmail,
    subject: `Your Ziventa order ${order.orderNumber}`,
    text: [
      `Dear ${order.contactName},`,
      '',
      'Thank you for your order. We have it, and we will call you to confirm',
      'your delivery slot before it goes out.',
      '',
      `Order number: ${order.orderNumber}`,
      '',
      orderLines(order),
      '',
      `Subtotal: ${rupees(order.subtotalPaise)}`,
      `Delivery: ${order.shippingPaise === 0 ? 'Free' : rupees(order.shippingPaise)}`,
      `Total:    ${rupees(order.totalPaise)}`,
      '',
      'Delivering to:',
      addressBlock(order),
      '',
      'No payment has been taken yet. We confirm every order by phone first.',
      '',
      'Ziventa Gaushala',
    ].join('\n'),
  };
}

/** Sent to you, so an order does not sit unnoticed in the database. */
export function businessOrderEmail(order: OrderEmailData): EmailMessage {
  return {
    to: businessInbox(),
    replyTo: order.contactEmail,
    subject: `New order ${order.orderNumber} - ${rupees(order.totalPaise)}`,
    text: [
      `New order: ${order.orderNumber}`,
      '',
      orderLines(order),
      '',
      `Subtotal: ${rupees(order.subtotalPaise)}`,
      `Delivery: ${rupees(order.shippingPaise)}`,
      `Total:    ${rupees(order.totalPaise)}`,
      '',
      `${order.contactName}`,
      `${order.contactEmail}`,
      `${order.contactPhone}`,
      addressBlock(order),
      ...(order.notes ? ['', `Notes: ${order.notes}`] : []),
    ].join('\n'),
  };
}

// ------------------------------------------------------------------- leads

export interface LeadEmailData {
  reference: string | null;
  fullName: string;
  email: string;
  phone?: string | null;
  city?: string | null;
  message?: string | null;
}

/**
 * "Membership reserved" - sent the moment someone taps Notify Me.
 *
 * Careful with the wording: a place is being held, not sold. Nothing has been
 * paid and no seat is confirmed until you have spoken to them, so the email
 * says that plainly rather than implying they are already a member.
 */
export function customerLeadEmail(lead: LeadEmailData): EmailMessage {
  return {
    to: lead.email,
    subject: `Membership reserved - Gir Gold Club${lead.reference ? ` (${lead.reference})` : ''}`,
    text: [
      `Dear ${lead.fullName},`,
      '',
      'Your place in the Ziventa Gir Gold Club is reserved.',
      ...(lead.reference ? ['', `Your reference: ${lead.reference}`] : []),
      '',
      'Founding membership is limited to 250 families. We hold your place while',
      'we get in touch - we speak to every family personally before a seat is',
      'confirmed, and there is nothing to pay until then.',
      '',
      'We will call you shortly on the number you gave us.',
      '',
      'Ziventa Gaushala',
    ].join('\n'),
  };
}

export function businessLeadEmail(lead: LeadEmailData): EmailMessage {
  return {
    to: businessInbox(),
    replyTo: lead.email,
    subject: `Membership reserved - ${lead.fullName}${lead.reference ? ` (${lead.reference})` : ''}`,
    text: [
      `Reference: ${lead.reference ?? '-'}`,
      '',
      `Name:  ${lead.fullName}`,
      `Email: ${lead.email}`,
      `Phone: ${lead.phone ?? '-'}`,
      `City:  ${lead.city ?? '-'}`,
      '',
      lead.message ?? '(no message)',
      '',
      'Call them to confirm the seat.',
    ].join('\n'),
  };
}
