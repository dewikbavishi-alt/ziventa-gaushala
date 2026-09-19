import { NextResponse, type NextRequest } from 'next/server';
import { createClient, getCurrentUser } from '@/lib/supabase/server';
import { syncCustomer } from '@/lib/auth';
import { safeNext } from '@/lib/safe-next';

/**
 * Where the email sign-in link lands.
 *
 * The link carries a one-time code. We swap that code for a real session,
 * which sets the login cookies, then send the person on their way.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // Only same-site paths. A full URL here would let anyone craft a real
  // Ziventa sign-in link that bounces the customer to their own site the
  // instant it succeeds, with all the trust of having started here.
  const next = safeNext(searchParams.get('next') ?? undefined);

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  /**
   * Copy the account into our own customers table the moment they sign in.
   *
   * This used to happen only when someone reached the account page, which meant a
   * person who signed in on their way to checkout - `?next=/#shop` - had no
   * customer row at all until they happened to visit their account page. Their
   * email was in Supabase but not in our database, so the admin dashboard's
   * account count and any future email to customers simply did not know about
   * them.
   *
   * A failure here must not block the sign-in. They are already authenticated
   * by this point; the row can be created on their next page view instead.
   */
  try {
    const user = await getCurrentUser();
    if (user) await syncCustomer(user);
  } catch (err) {
    console.error(`[auth-callback] syncCustomer failed: ${(err as Error).message}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
