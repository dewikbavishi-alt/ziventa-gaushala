/**
 * Render the emails from hostile input and check nothing escapes.
 *
 *   npm run email:render-test
 *
 * Sends nothing. Builds the messages in memory and asserts that user-supplied
 * text cannot become markup in the HTML body or a second header line.
 */

import {
  businessLeadEmail,
  businessOrderEmail,
  customerLeadEmail,
  customerOrderEmail,
  escapeHtml,
  headerSafe,
  type EmailMessage,
} from '../src/lib/email';

let failures = 0;

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`  ok    ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ''}`);
  }
}

/** The payloads someone actually tries. */
const XSS = '<img src=x onerror="alert(1)">';
const INJECT = 'Bob\r\nBcc: victim@example.com';

function assertSafe(label: string, msg: EmailMessage) {
  console.log(`\n${label}`);

  // No header may contain a line break - that is what ends a header.
  check('subject has no CR/LF', !/[\r\n]/.test(msg.subject));
  check('to has no CR/LF', !/[\r\n]/.test(msg.to));
  check('replyTo has no CR/LF', !msg.replyTo || !/[\r\n]/.test(msg.replyTo));

  if (msg.html) {
    // The raw attack string must not survive; its escaped form must.
    check('raw script payload absent from HTML', !msg.html.includes(XSS));
    check('payload present but escaped', msg.html.includes(escapeHtml(XSS)));
    /**
     * The real property: no tag from user input became markup. Checking for
     * the string "onerror=" instead would fail on correctly escaped output,
     * because `&lt;img src=x onerror=&quot;...&quot;&gt;` still contains those
     * characters as harmless text - which is exactly what it should do.
     */
    check('no user-supplied tag became real markup', !/<img/i.test(msg.html));
    check('only our own tags present', !/<(script|iframe|object|embed)/i.test(msg.html));
    check('has a text fallback too', msg.text.length > 0);
  }
}

console.log('Rendering with hostile input...');

assertSafe(
  'customerOrderEmail',
  customerOrderEmail({
    orderNumber: 'ZV-260919-TEST01',
    contactName: XSS,
    contactEmail: 'buyer@example.com',
    contactPhone: '9876543210',
    shipLine1: XSS,
    shipLine2: null,
    shipCity: 'Surat',
    shipState: 'Gujarat',
    shipPostcode: '395007',
    subtotalPaise: 315000,
    shippingPaise: 0,
    totalPaise: 315000,
    notes: XSS,
    items: [{ productName: XSS, unitPricePaise: 315000, quantity: 1 }],
  }),
);

assertSafe(
  'businessOrderEmail',
  businessOrderEmail({
    orderNumber: 'ZV-260919-TEST02',
    contactName: INJECT,
    contactEmail: 'buyer@example.com',
    contactPhone: '9876543210',
    shipLine1: XSS,
    shipLine2: null,
    shipCity: 'Surat',
    shipState: 'Gujarat',
    shipPostcode: '395007',
    subtotalPaise: 44900,
    shippingPaise: 5000,
    totalPaise: 49900,
    notes: null,
    items: [{ productName: XSS, unitPricePaise: 44900, quantity: 1 }],
  }),
);

assertSafe(
  'customerLeadEmail',
  customerLeadEmail({
    reference: 'ZGC-260919-TEST',
    fullName: XSS,
    email: 'family@example.com',
    phone: '9876543210',
    city: 'Surat',
    message: XSS,
  }),
);

// The dangerous one: the enquirer's name goes straight into the subject line.
const leadToBusiness = businessLeadEmail({
  reference: 'ZGC-260919-TEST',
  fullName: INJECT,
  email: 'family@example.com',
  phone: '9876543210',
  city: 'Surat',
  message: XSS,
});
assertSafe('businessLeadEmail', {
  ...leadToBusiness,
  // sendEmail() cleans headers on the way out, so check what it will send.
  subject: headerSafe(leadToBusiness.subject),
  to: headerSafe(leadToBusiness.to),
  replyTo: leadToBusiness.replyTo ? headerSafe(leadToBusiness.replyTo) : undefined,
});

console.log('\nheaderSafe / escapeHtml directly');
check('strips CR and LF', !/[\r\n]/.test(headerSafe(INJECT)));
check('drops the injected Bcc onto one line', headerSafe(INJECT) === 'Bob Bcc: victim@example.com');
check('escapes angle brackets', escapeHtml('<b>') === '&lt;b&gt;');
check('escapes quotes', escapeHtml(`"'`) === '&quot;&#39;');
check('escapes ampersand first', escapeHtml('&lt;') === '&amp;lt;');
check('caps absurd lengths', headerSafe('x'.repeat(5000)).length === 200);

console.log('');
if (failures > 0) {
  console.log(`${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('All checks passed.');
