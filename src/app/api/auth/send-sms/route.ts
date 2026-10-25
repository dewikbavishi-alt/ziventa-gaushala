import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { accountExistsByPhone } from '@/lib/supabase/admin';
import { deviceKey, takeAllowance, waitPhrase } from '@/lib/throttle';
import { looksLikePhone, maskPhone, toE164 } from '@/lib/phone';

/**
 * Texts a one-time sign-in code.
 *
 * The sign-in form used to call supabase.auth.signInWithOtp({ phone }) itself,
 * straight from the browser. That works, and two things were wrong with it:
 *
 *   1. `shouldCreateUser` was decided in the BROWSER. Passing it from client
 *      code means the sign-in path can be told to create accounts - and the
 *      email route has refused to do that since the day two mistyped
 *      addresses turned into real accounts.
 *   2. Nothing on the way out was counted. Email is free to send badly; every
 *      SMS is billed, so an uncounted send endpoint is an uncapped invoice.
 *
 * Routing it through here fixes both for this site's own flow. Be clear about
 * what it does NOT fix: the anon key is in the page, so Supabase's OTP
 * endpoint stays reachable from anywhere by anyone who reads the bundle. This
 * route is the limit on the normal path, not a wall in front of Supabase. The
 * real backstops are Supabase's own rate limits and the provider's spend cap.
 *
 * Nothing here sends until NEXT_PUBLIC_PHONE_AUTH_ENABLED is true AND a
 * provider is configured in Supabase - which in India also means DLT
 * registration. See the note on PHONE_ENABLED in components/auth-form.tsx.
 */
export const dynamic = 'force-dynamic';

/**
 * Rate limits. ALL OFF, matching the email route.
 *
 * Zero means "do not check this one", and the COUNT queries are skipped with
 * them. Sends are still RECORDED, so email_throttle shows what went out and
 * can answer "are we being billed for somebody else's script?" before anyone
 * has to decide whether to switch a limit on.
 *
 * Suggested values if you ever do: 3 per 15 minutes and 8 a day per number,
 * 5 an hour and 15 a day per connection.
 */
const num = (raw: string | undefined, fallback: number): number => {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const MAX_PER_WINDOW = num(process.env.OTP_SMS_MAX_PER_WINDOW, 0);
const WINDOW_MINUTES = num(process.env.OTP_SMS_WINDOW_MINUTES, 15);
const MAX_PER_DAY = num(process.env.OTP_SMS_MAX_PER_DAY, 0);
const DEVICE_PER_HOUR = num(process.env.OTP_SMS_DEVICE_PER_HOUR, 0);
const DEVICE_PER_DAY = num(process.env.OTP_SMS_DEVICE_PER_DAY, 0);

const deviceLimits = [
  ...(DEVICE_PER_HOUR > 0 ? [{ max: DEVICE_PER_HOUR, minutes: 60 }] : []),
  ...(DEVICE_PER_DAY > 0 ? [{ max: DEVICE_PER_DAY, minutes: 24 * 60 }] : []),
];

const schema = z.object({
  phone: z.string().trim().min(6).max(24),
  intent: z.enum(['signin', 'signup']),
});

/** One reply for every outcome - see the email route for why. */
function generic() {
  return NextResponse.json(
    { ok: true, message: 'If that number can be used to sign in, a code is on its way.' },
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
    return NextResponse.json({ error: 'Please enter a valid mobile number' }, { status: 422 });
  }

  const phone = toE164(parsed.data.phone);
  const isSignup = parsed.data.intent === 'signup';

  // The shape check comes before anything else: a typo should not spend an
  // allowance, and it certainly should not reach a paid provider.
  if (!looksLikePhone(phone)) {
    return NextResponse.json({ error: 'Please enter a valid mobile number' }, { status: 422 });
  }

  // Called with an empty list while limits are off: it still records, so the
  // ledger remains evidence of what went out.
  const device = await takeAllowance(deviceKey(request), 'sms_code_device', deviceLimits);
  if (!device.ok) {
    return NextResponse.json(
      {
        error: `Too many code requests from this connection. Please try again ${waitPhrase(device.retryMinutes)}.`,
      },
      { status: 429 },
    );
  }

  if (MAX_PER_WINDOW > 0 || MAX_PER_DAY > 0) {
    const recent =
      MAX_PER_WINDOW > 0
        ? await prisma.emailThrottle.count({
            where: {
              email: phone,
              kind: 'auth_sms',
              sentAt: { gte: new Date(Date.now() - WINDOW_MINUTES * 60_000) },
            },
          })
        : 0;
    const today =
      MAX_PER_DAY > 0
        ? await prisma.emailThrottle.count({
            where: {
              email: phone,
              kind: 'auth_sms',
              sentAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) },
            },
          })
        : 0;

    if ((MAX_PER_WINDOW > 0 && recent >= MAX_PER_WINDOW) || (MAX_PER_DAY > 0 && today >= MAX_PER_DAY)) {
      console.warn(`[auth-sms] throttled ${maskPhone(phone)}: ${recent} in ${WINDOW_MINUTES}m, ${today} today`);
      return generic();
    }
  }

  /**
   * Whether this may create an account is decided HERE, not in the browser.
   *
   * Signing in must never create one: a mistyped number would otherwise
   * produce a new empty account and leave the family convinced their orders
   * had vanished. Exactly the rule accountExists() has enforced on the email
   * side since two addresses that had never signed up became accounts the
   * moment a code was generated for them.
   */
  try {
    if (!isSignup) {
      if (!(await accountExistsByPhone(phone))) {
        console.warn(`[auth-sms] no account for ${maskPhone(phone)}; refusing to create one`);
        return generic();
      }
    } else if (await accountExistsByPhone(phone)) {
      // Same deliberate trade as the email route: a returning customer is told
      // plainly, rather than handed a code for an account they already have.
      return NextResponse.json(
        { ok: false, exists: true, error: 'An account already exists for this mobile number.' },
        { status: 409 },
      );
    }
  } catch (err) {
    console.error(`[auth-sms] phone lookup threw: ${(err as Error).message}`);
    return generic();
  }

  // Recorded before sending, as on the email route: a send that hangs or a
  // function that is killed must still be counted. On a billed channel that
  // matters more, not less.
  await prisma.emailThrottle.create({ data: { email: phone, kind: 'auth_sms' } });

  /**
   * The ANON key, not the service role one.
   *
   * signInWithOtp is a public endpoint and this is the same call the browser
   * used to make - the server simply makes it instead, after the checks above.
   * The service role key would not help: there is no admin "send an SMS code".
   */
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    console.error('[auth-sms] Supabase is not configured');
    return generic();
  }

  const supabase = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await supabase.auth.signInWithOtp({
    phone,
    // A server decision now, taken from `intent` after the checks above.
    options: { shouldCreateUser: isSignup },
  });

  if (error) {
    // Usually no provider configured, DLT not registered, or Supabase's own
    // rate limit. All of it names our setup, so it is logged, not returned.
    console.error(`[auth-sms] send failed for ${maskPhone(phone)}: ${error.message}`);
  }

  return generic();
}
