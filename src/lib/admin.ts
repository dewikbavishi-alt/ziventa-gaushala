import 'server-only';
import { cache } from 'react';
import { getCurrentUser } from './supabase/server';

/**
 * The admin dashboard belongs to ONE person: the shop owner.
 *
 * There is exactly one way in, and nothing in the app can add another:
 *
 *   - ADMIN_EMAILS must hold exactly one address. That address is the owner.
 *   - The signed-in account must have that address AND have verified it.
 *
 * There is no admin role in the database, no "make admin" button and no
 * promote script - all three were removed deliberately. A second person can
 * only be given access by editing the environment variable on Vercel, which
 * needs the owner's Vercel login.
 *
 * Fails CLOSED in every doubtful case:
 *   - variable missing or empty            -> nobody
 *   - variable holding two or more emails  -> nobody, and an error is logged
 *   - address not yet verified             -> nobody
 *
 * The two-or-more case is closed rather than "use the first one" on purpose.
 * Someone adding a second address clearly expects it to work; silently
 * ignoring it would hide the fact that the rule is one owner, and silently
 * honouring it would break the rule. Refusing both, loudly, is the only
 * answer that leaves no doubt.
 *
 * Identity always comes from the Supabase session, verified by getUser()
 * against Supabase itself. Nothing here reads an email or id from the request.
 */
export function ownerEmail(): string | null {
  const list = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (list.length > 1) {
    console.error(
      `[admin] ADMIN_EMAILS lists ${list.length} addresses. The dashboard allows exactly one owner, ` +
        'so NOBODY can sign in until it holds a single address.',
    );
    return null;
  }

  return list[0] ?? null;
}

/**
 * The owner, if the current request is theirs; otherwise null.
 *
 * Wrapped in React's cache() so it runs once per request however often it is
 * called - and it IS called more than once: a Next.js layout and its page
 * render in parallel, so each admin page checks for itself rather than
 * relying on the layout having redirected a stranger first.
 */
export const getAdminUser = cache(async () => {
  const owner = ownerEmail();
  if (!owner) return null;

  const user = await getCurrentUser();
  if (!user?.email) return null;

  // An unverified address proves nothing about who is holding it.
  if (!user.email_confirmed_at) return null;

  return user.email.toLowerCase() === owner ? user : null;
});

export async function isAdmin(): Promise<boolean> {
  return (await getAdminUser()) !== null;
}

/**
 * First line of every Server Action that reads or changes admin data.
 *
 * Next's own docs warn that Server Functions are reachable by a direct POST,
 * not only through the button that renders them - so guarding the page alone
 * would leave every action open to anyone who found its id.
 */
export async function requireAdmin() {
  const user = await getAdminUser();
  if (!user) throw new Error('Not authorised');
  return user;
}
