import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin';

/**
 * Where a sign-in lands when the link did not ask for anywhere in particular.
 *
 * The owner goes to /admin, everyone else to their account. Signing in used to
 * send the owner to /your-account like any customer, which meant the one route
 * that exists for getting back in when email is down - /login?mode=password -
 * finished one navigation short of the dashboard it exists to reach.
 *
 * The decision is made here rather than in the form because it reads
 * ADMIN_EMAILS, which is server-only and has to stay that way. The browser
 * never learns who the owner is; it only knows to come here and follow the
 * redirect it is given.
 *
 * An explicit ?next= still wins - this is only the default. /auth/ is already
 * disallowed in robots.ts, so nothing here is crawlable.
 */
export const dynamic = 'force-dynamic';

export default async function AfterSignIn() {
  redirect((await isAdmin()) ? '/admin' : '/your-account');
}
