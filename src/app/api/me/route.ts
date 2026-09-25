import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/supabase/server';
import { memberRateApplies } from '@/lib/orders';

/**
 * Who is signed in, if anyone.
 *
 * The landing page is plain HTML, so it cannot read the session on the server.
 * It calls this on load to decide whether to show "You're not signed in", and
 * now also which of the two prices to display.
 *
 * Deliberately returns only what the page needs to render a name. No id, no
 * token, nothing that would be worth stealing from the browser.
 *
 * `member` here only decides what is SHOWN. Editing it in the browser changes
 * the displayed price and nothing else: the order route asks the database the
 * same question again, from the session, and charges on that answer.
 */
export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { signedIn: false, member: false },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const label =
    (user.user_metadata?.full_name as string | undefined) ??
    user.email ??
    user.phone ??
    'your account';

  return NextResponse.json(
    { signedIn: true, label, member: await memberRateApplies(user.id) },
    // Never cache this - a shared cache would show one person's name, and now
    // one person's prices, to another.
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
