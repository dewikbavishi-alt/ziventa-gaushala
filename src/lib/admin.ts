import { getCurrentUser } from './supabase/server';

/**
 * Who is allowed into /admin.
 *
 * A comma-separated allow-list in ADMIN_EMAILS, checked against the email on
 * the signed-in Supabase account. Not a password: there is nothing to leak,
 * share or brute-force, and revoking access is one environment variable.
 *
 * Fails CLOSED. If ADMIN_EMAILS is unset or empty, nobody is an admin -
 * including on a fresh deploy where someone forgot to set it. The alternative,
 * defaulting to "allow", would publish every order the moment a variable went
 * missing.
 */
function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function getAdminUser() {
  const user = await getCurrentUser();
  if (!user?.email) return null;

  const allowed = adminEmails();
  if (allowed.length === 0) return null;

  return allowed.includes(user.email.toLowerCase()) ? user : null;
}

export async function isAdmin(): Promise<boolean> {
  return (await getAdminUser()) !== null;
}

/**
 * Use at the top of every Server Action that changes data.
 *
 * Next's own docs warn that Server Functions can be hit by a direct POST, not
 * only through the page that renders the button - so guarding the page alone
 * would leave the actions wide open.
 */
export async function requireAdmin() {
  const user = await getAdminUser();
  if (!user) throw new Error('Not authorised');
  return user;
}
