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
  /** Plain-text fallback. Always sent, never optional. */
  text: string;
  /** Optional HTML alternative. Mail clients pick whichever they prefer. */
  html?: string;
  replyTo?: string;
  /**
   * Keeps the subject out of the logs.
   *
   * Sign-in codes go in the subject line so a phone shows them in the
   * notification - which also means logging the subject would write a live
   * credential into the log. The recipient and the outcome are still logged,
   * which is what matters when chasing a message that did not arrive.
   */
  sensitive?: boolean;
}

/**
 * Escape text before it goes anywhere near an HTML email body.
 *
 * Every value in these emails comes from a form a stranger filled in. A name
 * of `<img src=x onerror=...>` would otherwise be markup in the message YOU
 * open, and some mail clients still render more than they should.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Strip anything that could break out of a header line.
 *
 * A subject or reply-to built from user input is a header-injection risk: a
 * carriage return or newline ends the header and lets the rest be read as new
 * ones - `Bcc:` being the obvious prize. Nodemailer encodes headers itself, so
 * this is defence in depth rather than the only guard, and it costs nothing.
 *
 * Also caps the length, because an enormous subject is its own problem.
 */
export function headerSafe(value: string, max = 200): string {
  return value
    .replace(/[\r\n\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Wraps body rows in a plain, well-supported HTML shell. */
function htmlShell(heading: string, rows: string, footer: string): string {
  // Inline styles and a table layout on purpose: mail clients strip <style>
  // blocks and have patchy flexbox support. This renders the same in Gmail,
  // Outlook and Apple Mail.
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#FBF6EC;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2F4A3D;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e6ded0;border-radius:12px;">
    <tr><td style="padding:24px;">
      <h1 style="margin:0 0 16px;font-size:18px;color:#1E4A35;">${escapeHtml(heading)}</h1>
      ${rows}
      <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #efe7da;font-size:12px;color:#6b7d72;">
        ${footer}
      </p>
    </td></tr>
  </table>
</body></html>`;
}

/** One `Label: value` line. `value` is escaped here so callers cannot forget. */
function field(label: string, value: string | null | undefined): string {
  if (!value) return '';
  return `<p style="margin:0 0 8px;font-size:14px;">
    <strong style="color:#6b7d72;font-weight:600;">${escapeHtml(label)}:</strong>
    ${escapeHtml(value)}
  </p>`;
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
  const describe = message.sensitive ? '(withheld)' : JSON.stringify(message.subject);

  if (!smtpConfigured()) {
    console.log(`[email:not-configured] to=${message.to} subject=${describe}`);
    return { delivered: false, reason: 'SMTP is not configured; logged only' };
  }

  try {
    const info = await transporter().sendMail({
      from: fromAddress(),
      // Every one of these becomes a header line, and all three can carry
      // values a stranger typed into a form. Cleaned centrally so no caller
      // has to remember.
      to: headerSafe(message.to),
      subject: headerSafe(message.subject),
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
      ...(message.replyTo ? { replyTo: headerSafe(message.replyTo) } : {}),
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
    console.error(`[email:failed] to=${message.to} subject=${describe} reason=${reason}`);
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

/** The ordered items as an HTML table. Product names are escaped. */
function itemsTable(order: OrderEmailData): string {
  const rows = order.items
    .map(
      (i) => `<tr>
        <td style="padding:6px 0;font-size:14px;">${escapeHtml(i.productName)} &times; ${i.quantity}</td>
        <td style="padding:6px 0;font-size:14px;text-align:right;">${rupees(i.unitPricePaise * i.quantity)}</td>
      </tr>`,
    )
    .join('');

  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:12px 0;border-top:1px solid #efe7da;">
    ${rows}
    <tr><td style="padding:8px 0 0;border-top:1px solid #efe7da;font-size:14px;">Subtotal</td>
        <td style="padding:8px 0 0;border-top:1px solid #efe7da;font-size:14px;text-align:right;">${rupees(order.subtotalPaise)}</td></tr>
    <tr><td style="padding:4px 0;font-size:14px;">Delivery</td>
        <td style="padding:4px 0;font-size:14px;text-align:right;">${order.shippingPaise === 0 ? 'Free' : rupees(order.shippingPaise)}</td></tr>
    <tr><td style="padding:4px 0;font-size:15px;font-weight:700;color:#1E4A35;">Total</td>
        <td style="padding:4px 0;font-size:15px;font-weight:700;text-align:right;color:#1E4A35;">${rupees(order.totalPaise)}</td></tr>
  </table>`;
}

/** Sent to the customer. */
export function customerOrderEmail(order: OrderEmailData): EmailMessage {
  return {
    to: order.contactEmail,
    subject: `Your Ziventa order ${order.orderNumber}`,
    html: htmlShell(
      `Thank you for your order`,
      `<p style="margin:0 0 12px;font-size:14px;">Dear ${escapeHtml(order.contactName)},</p>
       <p style="margin:0 0 12px;font-size:14px;">
         We have your order and will call you to confirm your delivery slot before it goes out.
       </p>
       ${field('Order number', order.orderNumber)}
       ${itemsTable(order)}
       ${field('Delivering to', addressBlock(order))}
       <p style="margin:16px 0 0;font-size:14px;">
         No payment has been taken yet. We confirm every order by phone first.
       </p>`,
      'Ziventa Gaushala',
    ),
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
    html: htmlShell(
      `New order ${order.orderNumber}`,
      `${itemsTable(order)}
       ${field('Name', order.contactName)}
       ${field('Email', order.contactEmail)}
       ${field('Phone', order.contactPhone)}
       ${field('Address', addressBlock(order))}
       ${field('Notes', order.notes)}`,
      'Reply to this email to reach the customer directly.',
    ),
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

// -------------------------------------------------------------- sign-in

/**
 * The one-time sign-in code, sent by us rather than by Supabase.
 *
 * A code rather than a link: a link means leaving the page, opening a mail
 * app, and landing back in a different browser, which is where "session
 * missing" failures come from. A code is typed into the page already open.
 *
 * Supabase mints it and owns its expiry and single use; this only carries it.
 * The email says how long it lasts and what to do if the recipient did not
 * ask for it, because anyone can type someone else's address into a form.
 */
export function authCodeEmail(params: {
  to: string;
  code: string;
  isSignup: boolean;
}): EmailMessage {
  const { to, code, isSignup } = params;
  const heading = isSignup ? 'Finish creating your account' : 'Your sign-in code';

  return {
    to,
    // In the subject so a phone shows it in the notification without opening
    // anything - and therefore marked sensitive, so it never reaches the log.
    subject: `${code} is your Ziventa ${isSignup ? 'sign-up' : 'sign-in'} code`,
    sensitive: true,
    html: htmlShell(
      heading,
      `<p style="margin:0 0 16px;font-size:14px;">
         ${isSignup
           ? 'Enter this code on the sign-up page to finish setting up your account.'
           : 'Enter this code on the sign-in page and you will be signed in.'}
       </p>
       <p style="margin:0 0 20px;padding:16px;background:#FBF6EC;border:1px solid #e6ded0;
                 border-radius:10px;text-align:center;font-size:30px;font-weight:700;
                 letter-spacing:8px;color:#1E4A35;font-family:monospace;">
         ${escapeHtml(code)}
       </p>
       <p style="margin:0 0 8px;font-size:13px;color:#6b7d72;">
         This code works once and expires in about an hour.
       </p>
       <p style="margin:0;font-size:13px;color:#6b7d72;">
         If you did not ask to sign in, you can ignore this email - nothing will happen
         unless the code is entered. Never share it with anyone, including us.
       </p>`,
      'Ziventa Gaushala',
    ),
    text: [
      heading,
      '',
      isSignup
        ? 'Enter this code on the sign-up page to finish setting up your account:'
        : 'Enter this code on the sign-in page and you will be signed in:',
      '',
      `    ${code}`,
      '',
      'This code works once and expires in about an hour.',
      '',
      'If you did not ask to sign in, you can ignore this email - nothing will',
      'happen unless the code is entered. Never share it with anyone, including us.',
      '',
      'Ziventa Gaushala',
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
    html: htmlShell(
      'Your place is reserved',
      `<p style="margin:0 0 12px;font-size:14px;">Dear ${escapeHtml(lead.fullName)},</p>
       <p style="margin:0 0 12px;font-size:14px;">
         Your place in the Ziventa Gir Gold Club is reserved.
       </p>
       ${field('Your reference', lead.reference)}
       <p style="margin:12px 0;font-size:14px;">
         Founding membership is limited to 250 families. We hold your place while we get in
         touch - we speak to every family personally before a seat is confirmed, and there is
         nothing to pay until then.
       </p>
       <p style="margin:0;font-size:14px;">We will call you shortly on the number you gave us.</p>`,
      'Ziventa Gaushala',
    ),
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
    html: htmlShell(
      'New membership enquiry',
      `${field('Reference', lead.reference)}
       ${field('Name', lead.fullName)}
       ${field('Email', lead.email)}
       ${field('Phone', lead.phone)}
       ${field('City', lead.city)}
       ${field('Message', lead.message)}`,
      'Call them to confirm the seat. Reply to this email to reach them directly.',
    ),
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
