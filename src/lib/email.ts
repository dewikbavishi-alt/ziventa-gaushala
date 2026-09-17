/**
 * Sending email, over SMTP, with Nodemailer.
 *
 * Nodemailer is a client, not a mail service - it needs an SMTP server to hand
 * messages to. Which one is entirely a matter of configuration: Hostinger,
 * Gmail, Resend's SMTP endpoint, anything that speaks SMTP. Nothing in this
 * file names a provider, so switching later is four environment variables and
 * no code change.
 *
 * If SMTP is not configured, nothing breaks: the message is logged and the
 * caller is told it was not delivered. That way the site works before email is
 * set up, and no order is ever lost because a mail server was down.
 */

import nodemailer, { type Transporter } from 'nodemailer';

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
  // Must be an address the SMTP server is willing to send as. Most providers
  // reject a From that does not belong to the account, so this normally needs
  // to match SMTP_USER or a verified alias on the same domain.
  return process.env.MAIL_FROM ?? 'Ziventa Gaushala <orders@girbyziventa.com>';
}

/** Where order and enquiry alerts go. */
export function businessInbox(): string {
  return process.env.MAIL_TO ?? 'dewikbavishi4@gmail.com';
}

/** Whether this deployment can send at all. Used by /api/health too. */
export function smtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim(),
  );
}

/**
 * One transporter per process, cached like the Prisma client.
 *
 * Deliberately NOT pooled. A pool keeps connections open between sends, which
 * is right for a long-lived server and wrong here - a serverless function can
 * be frozen or discarded at any moment, and the pool's idle sockets go with
 * it, producing timeouts on the next send rather than saving anything.
 *
 * The three timeouts matter more than they look. Without them a mail server
 * that accepts the connection and then goes quiet will hold the function open
 * until the platform kills it, and the customer watches a spinner. Ten seconds
 * and we give up - the order is already saved by then either way.
 */
const globalForMail = globalThis as unknown as { mailer?: Transporter };

function transporter(): Transporter {
  if (globalForMail.mailer) return globalForMail.mailer;

  const port = Number(process.env.SMTP_PORT ?? 587);

  const created = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // Port 465 is implicit TLS from the first byte. Everything else starts in
    // the clear and upgrades with STARTTLS, which `secure: false` selects.
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
  });

  globalForMail.mailer = created;
  return created;
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  if (!smtpConfigured()) {
    console.log(
      `[email:not-configured] to=${message.to} subject=${JSON.stringify(message.subject)}`,
    );
    return { delivered: false, reason: 'SMTP is not configured; logged only' };
  }

  try {
    const info = await transporter().sendMail({
      from: fromAddress(),
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
    });

    // A server can accept the connection and still refuse the recipient, which
    // is not an exception - it comes back in `rejected`.
    if (info.rejected?.length) {
      return { delivered: false, reason: `Rejected by mail server: ${info.rejected.join(', ')}` };
    }

    return { delivered: true };
  } catch (err) {
    // Never rethrow. The order or enquiry is already in the database, and
    // losing it because a mail server hiccuped would be the worse failure.
    const reason = (err as Error).message;
    console.error(`[email:failed] to=${message.to} reason=${reason}`);
    return { delivered: false, reason };
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
