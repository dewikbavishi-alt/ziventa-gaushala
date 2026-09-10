import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/supabase/server';

/**
 * Who is signed in, if anyone.
 *
 * The landing page is plain HTML, so it cannot read the session on the server.
 * It calls this on load to decide whether to show "You're not signed in".
 *
 * Deliberately returns only what the page needs to render a name. No id, no
 * token, nothing that would be worth stealing from the browser.
 */
export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { signedIn: false },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const label =
    (user.user_metadata?.full_name as string | undefined) ??
    user.email ??
    user.phone ??
    'your account';

  return NextResponse.json(
    { signedIn: true, label },
    // Never cache this - a shared cache would show one person's name to another.
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
