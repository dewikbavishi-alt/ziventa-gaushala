/**
 * Set a Supabase account's password directly, without sending any email.
 *
 *   npm run auth:set-password -- you@example.com
 *
 * Supabase's own "Reset password" button emails a recovery link, so it fails
 * whenever email is broken - which is precisely when you are locked out and
 * need it. This uses the admin API instead, which changes the password on the
 * spot and sends nothing.
 *
 * Runs locally only. It needs SUPABASE_SERVICE_ROLE_KEY, which bypasses every
 * row-level security rule in the database: it belongs in .env.local and must
 * never reach the browser, a client component, or a public variable.
 *
 * The password is typed at a hidden prompt rather than passed as an argument,
 * so it does not end up in your shell history or in the process list.
 */

import { createInterface } from 'node:readline';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv();

const email = process.argv[2];
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!email) {
  console.error('Usage: npm run auth:set-password -- you@example.com');
  process.exit(1);
}
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
};

/** Reads a line without echoing it to the screen. */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    // Suppress the echo of whatever is typed after the prompt is shown.
    let shown = false;
    const iface = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    iface._writeToOutput = (s: string) => {
      if (!shown) {
        iface.output.write(s);
        shown = true;
        return;
      }
      // Newlines still pass through so Enter behaves normally.
      if (s.includes('\n')) iface.output.write('\n');
    };
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

interface AdminUser {
  id: string;
  email?: string;
}

async function findUser(): Promise<AdminUser | null> {
  const res = await fetch(`${url}/auth/v1/admin/users?per_page=200`, { headers });
  if (!res.ok) {
    throw new Error(`Could not list users: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  const body = (await res.json()) as { users?: AdminUser[] };
  const wanted = email.toLowerCase();
  return body.users?.find((u) => u.email?.toLowerCase() === wanted) ?? null;
}

async function main() {
  console.log(`Looking up ${email} ...`);
  const user = await findUser();

  if (!user) {
    console.error('');
    console.error(`No account exists for ${email}.`);
    console.error('Create it first at /signup on the site, then run this again.');
    process.exit(1);
  }

  console.log(`Found account ${user.id}`);
  console.log('');

  const password = await askHidden('New password (min 8 characters, not shown): ');
  console.log('');

  if (password.length < 8) {
    console.error('Too short. Supabase requires at least 8 characters.');
    process.exit(1);
  }

  const res = await fetch(`${url}/auth/v1/admin/users/${user.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ password, email_confirm: true }),
  });

  if (!res.ok) {
    throw new Error(`Could not set password: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }

  console.log('Password set. No email was sent.');
  console.log('');
  console.log('Sign in at /login -> "Sign in with a password instead".');
}

main().catch((err: Error) => {
  console.error('');
  console.error(err.message);
  process.exit(1);
});
