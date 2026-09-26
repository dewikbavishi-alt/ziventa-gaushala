/**
 * Check SMTP settings without involving the website.
 *
 *   npm run email:test -- you@example.com
 *
 * Two separate checks, because they fail for different reasons and telling
 * them apart saves a lot of guessing:
 *
 *   1. verify()  - can we reach the server and log in? Catches a wrong host,
 *                  a blocked port, a bad password.
 *   2. sendMail  - will it actually accept and deliver a message? Catches a
 *                  From address the server will not send as, which is the
 *                  usual second surprise.
 */

import { config as loadEnv } from 'dotenv';
import nodemailer from 'nodemailer';

loadEnv({ path: '.env.local' });
loadEnv();

const to = process.argv[2];

if (!to) {
  console.error('Usage: npm run email:test -- you@example.com');
  process.exit(1);
}

const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT ?? 587);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
// Same rule as fromAddress() in src/lib/email.ts: fall back to the account
// doing the sending, never to an address nobody owns. A test that sends from
// a made-up address tests something the real code would never do.
const from = process.env.MAIL_FROM?.trim() || `Ziventa Gaushala <${user}>`;

const missing = [
  !host && 'SMTP_HOST',
  !user && 'SMTP_USER',
  !pass && 'SMTP_PASS',
].filter(Boolean);

if (missing.length) {
  console.error(`Missing: ${missing.join(', ')}`);
  console.error('Add them to .env.local first. See .env.example.');
  process.exit(1);
}

// Never print the password - not even its length.
console.log(`host   ${host}:${port}`);
console.log(`user   ${user}`);
console.log(`from   ${from}`);
console.log(`to     ${to}`);
console.log('');

const transport = nodemailer.createTransport({
  host,
  port,
  secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
  auth: { user, pass },
  connectionTimeout: 15_000,
  greetingTimeout: 15_000,
  socketTimeout: 15_000,
});

async function main() {
  process.stdout.write('1. Connecting and signing in... ');
  await transport.verify();
  console.log('ok');

  process.stdout.write('2. Sending a test message...  ');
  const info = await transport.sendMail({
    from,
    to,
    subject: 'Ziventa test email',
    text: [
      'This is a test from your Ziventa website.',
      '',
      'If you are reading this, order confirmations and membership emails',
      'will reach your customers.',
      '',
      `Sent via ${host}:${port}`,
    ].join('\n'),
  });
  console.log('ok');

  if (info.rejected?.length) {
    console.log('');
    console.log(`Rejected: ${info.rejected.join(', ')}`);
    process.exit(1);
  }

  console.log('');
  console.log(`Accepted for: ${info.accepted.join(', ')}`);
  console.log(`Server said:  ${info.response}`);
  console.log('');
  console.log('Now check the inbox - and the spam folder.');
}

main()
  .catch((err: Error) => {
    console.log('FAILED');
    console.log('');
    console.error(err.message);
    console.log('');
    console.log('Common causes:');
    console.log('  Invalid login          - wrong password, or the provider wants an app password');
    console.log('  ETIMEDOUT / ECONNREFUSED - wrong host or port, or the port is blocked');
    console.log('  self signed certificate  - wrong port for the security setting');
    console.log('  Sender address rejected  - MAIL_FROM is not an address this account may send as');
    process.exit(1);
  })
  .finally(() => transport.close());
