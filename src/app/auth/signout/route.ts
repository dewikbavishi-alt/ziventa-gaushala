import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/safe-next';

/**
 * Sign out. POST only on purpose: a GET would let any image or link on a page
 * log the person out without them meaning to.
 *
 * An optional `next` field carries on to the sign-in page, so "switch
 * account" from the admin's Owner-only screen lands back on /admin after
 * signing in as the right person, instead of on the customer account page.
 * Same-site paths only, through safeNext, like every other redirect here.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  let next: string | null = null;
  try {
    const form = await request.formData();
    const raw = form.get('next');
    if (typeof raw === 'string' && raw) next = safeNext(raw);
  } catch {
    // No form body - a plain sign-out.
  }

  const target = new URL('/login', request.url);
  if (next) target.searchParams.set('next', next);
  return NextResponse.redirect(target, { status: 303 });
}
