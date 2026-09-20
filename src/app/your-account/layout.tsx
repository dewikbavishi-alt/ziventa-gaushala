import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/supabase/server';
import { safeNext } from '@/lib/safe-next';

/**
 * Nothing under /your-account is ever prerendered. Every page here shows one
 * specific person's data, so a build-time snapshot would be wrong for
 * everyone - and it has to be said explicitly, because Next only works it out
 * once `cookies()` is reached, which is after any throw above it.
 */
export const dynamic = 'force-dynamic';

/**
 * The gate for every account page.
 *
 * Checked here, against the session Supabase verifies server-side - never
 * against a user id from the URL, a query parameter or anything else the
 * browser sent. There is no route in this section that takes an id, so one
 * signed-in person cannot ask for another's account by changing the address.
 *
 * Not done in proxy.ts: proxy runs before the route and exists to refresh the
 * session, not to decide who is allowed in. Each page also fetches its own
 * data through getCurrentCustomer, which redirects on its own if the session
 * has gone - so a page added later is still protected even if someone forgets
 * this file.
 *
 * `next` carries the requested page across the sign-in, so someone who lands
 * on a link to their orders while signed out arrives at their orders rather
 * than the hub.
 */
export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    // Comes from proxy.ts, which is the only place that can see it. Run
    // through safeNext anyway - a header is still something that arrived over
    // the wire, and this value ends up in a redirect.
    const pathname = (await headers()).get('x-pathname');
    const back = safeNext(pathname ?? '/your-account');
    redirect(`/login?next=${encodeURIComponent(back)}`);
  }

  return <>{children}</>;
}
