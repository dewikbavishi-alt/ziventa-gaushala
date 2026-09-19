import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { accountExists, adminClient } from '@/lib/supabase/admin';
import { authLinkEmail, sendEmail } from '@/lib/email';
import { safeNext } from '@/lib/safe-next';

/**
 * Sends the sign-in link ourselves instead of letting Supabase send it.
 *
 * Supabase still mints the link - generateLink() produces a real, single-use
 * credential and, unlike signInWithOtp, sends nothing. We then post it through
 * Nodemailer like every other email the site sends. One mail server, one set
 * of limits, one place to look when something does not arrive. Supabase's
 * built-in sender allows only a handful of messages an hour, which is what
 * kept locking this site out during testing.
 *
 * This route is deliberately the most defensive one in the project, because it
 * is the only endpoint that will mail an arbitrary address on request.
 */
export const dynamic = 'force-dynamic';

/** Per address, per window. Generous for a real person, useless for a spammer. */
const MAX_PER_WINDOW = 5;
const WINDOW_MINUTES = 15;

const schema = z.object({
  email: z.string().trim().email().max(200),
  intent: z.enum(['signin', 'signup']),
  next: z.string().trim().max(512).optional(),
  /** Only used on signup, where the form asks for it. */
  fullName: z.string().trim().max(120).optional(),
});

/**
 * One reply for every outcome.
 *
 * Whether an address has an account is private: a different answer for "no
 * such account" turns this endpoint into a way to test whether any given
 * person is a Ziventa customer. Rate-limited, refused, unknown address,
 * delivered - the caller is told the same thing.
 *
 * A function, not a shared constant. A response body is a stream that can be
 * read once, so returning one shared object would serve the JSON to the first
 * caller and an empty body to everyone after - which is exactly what it did
 * before this was fixed, and which would itself have leaked the answer.
 */
function generic() {
  return NextResponse.json(
    {
      ok: true,
      message: 'If that address can be used to sign in, a link is on its way.',
    },
    { status: 202 },
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    // A malformed address is the caller's own mistake, not a private fact, so
    // this one is worth reporting honestly.
    return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 422 });
  }

  const email = parsed.data.email.toLowerCase();
  const isSignup = parsed.data.intent === 'signup';

  // ---- rate limit ----------------------------------------------------
  const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);
  const recent = await prisma.emailThrottle.count({
    where: { email, kind: 'auth_link', sentAt: { gte: since } },
  });

  if (recent >= MAX_PER_WINDOW) {
    console.warn(`[auth-link] throttled ${email}: ${recent} in ${WINDOW_MINUTES}m`);
    return generic();
  }

  // ---- mint the link, without sending anything ------------------------
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? new URL(request.url).origin;
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(safeNext(parsed.data.next))}`;

  let link: string;
  try {
    const admin = adminClient();
    const exists = await accountExists(email);

    /**
     * Signing in must never create an account.
     *
     * generateLink({type:'magiclink'}) creates one when it is missing -
     * confirmed against a real project, where two addresses that had never
     * signed up became accounts the moment a link was generated for them. So
     * existence is checked here first, and an unknown address is turned away
     * before any link is minted. Otherwise a single typo would hand someone a
     * new empty account and leave them thinking their orders had disappeared.
     */
    if (!isSignup && !exists) {
      console.warn(`[auth-link] no account for ${email}; refusing to create one`);
      return generic();
    }

    /**
     * Signing up creates the account explicitly, so the name from the form is
     * stored with it. Supabase's own 'signup' link type demands a password,
     * which defeats a passwordless flow, so createUser plus a magic link does
     * the same job without one.
     *
     * email_confirm stays false: the address is only proven once the link is
     * actually opened, which is the entire point of sending it.
     */
    if (isSignup && !exists) {
      const { error: createError } = await admin.auth.admin.createUser({
        email,
        email_confirm: false,
        user_metadata: parsed.data.fullName ? { full_name: parsed.data.fullName } : undefined,
      });
      if (createError) {
        console.warn(`[auth-link] createUser for ${email}: ${createError.message}`);
        return generic();
      }
    }

    // Someone who already has an account but used the sign-up form simply
    // gets a sign-in link. That is what they wanted, and saying "you are
    // already registered" would leak that fact to anyone who guessed.

    const { data, error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo },
    });

    if (error || !data?.properties?.action_link) {
      // Usually "user not found" - a private fact. Logged for us, generic to
      // them.
      console.warn(`[auth-link] generateLink failed for ${email}: ${error?.message ?? 'no link'}`);
      return generic();
    }

    link = data.properties.action_link;
  } catch (err) {
    console.error(`[auth-link] admin call threw: ${(err as Error).message}`);
    return generic();
  }

  // ---- record BEFORE sending -----------------------------------------
  // Written first on purpose: if the send hangs or the function is killed
  // mid-flight, the attempt is still counted. Counting only successes would
  // let a stream of timeouts slip past the limit entirely.
  await prisma.emailThrottle.create({ data: { email, kind: 'auth_link' } });

  const result = await sendEmail(authLinkEmail({ to: email, link, isSignup }));

  if (!result.delivered) {
    console.error(`[auth-link] send failed for ${email}: ${result.reason}`);
    // Still generic to the caller - the reason names our mail server.
  }

  return generic();
}
