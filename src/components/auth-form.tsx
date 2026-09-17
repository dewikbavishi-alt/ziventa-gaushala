'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Mode = 'email' | 'phone' | 'password';

/**
 * Whether mobile sign-in is switched on.
 *
 * Supabase does not send SMS itself - it hands the message to a provider you
 * pay for (Twilio, MSG91 and so on), and in India that provider also needs DLT
 * registration before a single message is delivered. Until that exists, the
 * Phone tab can only ever produce an error, so it says so plainly rather than
 * letting someone type their number and watch it fail.
 *
 * Set NEXT_PUBLIC_PHONE_AUTH_ENABLED=true once a provider is configured in
 * Supabase. No code change needed.
 */
const PHONE_ENABLED = process.env.NEXT_PUBLIC_PHONE_AUTH_ENABLED === 'true';

/**
 * Supabase says this when an email has no account and we asked it not to make
 * one. It is accurate but reads like a fault; for a new customer it is not.
 */
const NO_ACCOUNT = /signups not allowed|otp_disabled|user not found/i;

/**
 * Both of these mean the message could not be handed to the email provider.
 * Nothing the person typed caused it, so telling them to check the address
 * would send them hunting for a mistake they did not make.
 */
const MAIL_BROKEN = /error sending|rate limit|smtp/i;

/**
 * `next` arrives as a prop, already read and checked on the server.
 *
 * It used to come from useSearchParams(), which forced this whole form behind
 * a Suspense boundary and meant the delivered HTML contained none of it - a
 * blank page until JavaScript loaded, and nothing at all without it. Reading
 * it on the server instead lets the form ship as real HTML.
 */
export function AuthForm({ intent, next }: { intent: 'signin' | 'signup'; next: string }) {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<Mode>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    kind: 'ok' | 'error';
    text: string;
    offerSignup?: boolean;
  } | null>(null);

  const isSignup = intent === 'signup';

  /** Email: send a one-time link. No password to forget. */
  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        /**
         * This is the real difference between the two pages.
         *
         * Signing in must NOT quietly create an account: someone mistyping
         * their address would otherwise land in a new, empty account and
         * conclude their orders had vanished.
         */
        shouldCreateUser: isSignup,
        // Carried into user_metadata, which is where syncCustomer reads it.
        data: isSignup ? { full_name: fullName.trim() || null } : undefined,
      },
    });

    setBusy(false);

    if (!error) {
      setMessage({
        kind: 'ok',
        text: isSignup
          ? `Almost there. We sent a link to ${email} - open it to finish creating your account.`
          : `Check ${email} for your sign-in link.`,
      });
      return;
    }

    if (!isSignup && NO_ACCOUNT.test(error.message)) {
      setMessage({
        kind: 'error',
        text: `We could not find an account for ${email}.`,
        offerSignup: true,
      });
      return;
    }

    if (MAIL_BROKEN.test(error.message)) {
      setMessage({
        kind: 'error',
        text: 'We could not send that email just now. This is a problem at our end, not with your address. Please try again shortly.',
      });
      return;
    }

    setMessage({ kind: 'error', text: error.message });
  }

  /**
   * Password sign-in.
   *
   * Exists because the magic link depends on email arriving, and when email
   * breaks it locks you out of your own admin dashboard - exactly when you
   * most need to look at it. A password does not touch the mail server.
   *
   * Sign-in only. Creating an account this way needs a confirmation email,
   * which puts us straight back where we started.
   */
  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);

    if (error) {
      setMessage({ kind: 'error', text: error.message });
      return;
    }

    router.push(next);
    router.refresh();
  }

  /** Phone step 1: ask Supabase to text a 6-digit code. */
  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithOtp({
      phone: toE164(phone),
      options: { shouldCreateUser: isSignup },
    });
    setBusy(false);
    if (error) {
      setMessage({ kind: 'error', text: error.message });
      return;
    }
    setCodeSent(true);
    setMessage({ kind: 'ok', text: `We sent a 6-digit code to ${toE164(phone)}.` });
  }

  /** Phone step 2: check the code and sign in. */
  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.verifyOtp({
      phone: toE164(phone),
      token: code,
      type: 'sms',
    });
    setBusy(false);
    if (error) {
      setMessage({ kind: 'error', text: error.message });
      return;
    }
    router.push(next);
    router.refresh();
  }

  const nextQuery = next !== '/account' ? `?next=${encodeURIComponent(next)}` : '';

  return (
    <main className="min-h-screen bg-[#FBF6EC] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-[#1E4A35] flex items-center justify-center">
            <span className="text-[#D9A92B] text-xl">&#10047;</span>
          </div>
          <h1 className="text-2xl font-semibold text-[#2F4A3D]">Ziventa Gaushala</h1>
          <p className="mt-1 text-sm text-[#2F4A3D]/70">
            {isSignup ? 'Create your account' : 'Sign in to your account'}
          </p>
        </div>

        <div className="rounded-2xl border border-[#2F4A3D]/10 bg-white p-6 shadow-sm">
          {/* Mode switch */}
          <div className="mb-6 grid grid-cols-2 rounded-lg bg-[#FBF6EC] p-1 text-sm font-medium">
            {(['email', 'phone'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setMessage(null);
                  setCodeSent(false);
                }}
                className={`rounded-md py-2 transition ${
                  // 'password' is still email sign-in, so the Email tab stays lit.
                  (m === 'phone') === (mode === 'phone')
                    ? 'bg-white text-[#1E4A35] shadow-sm'
                    : 'text-[#2F4A3D]/60'
                }`}
              >
                {m === 'email' ? 'Email' : 'Phone'}
              </button>
            ))}
          </div>

          {mode === 'email' && (
            <form onSubmit={sendMagicLink} className="space-y-4">
              {isSignup && (
                <label className="block">
                  <span className="text-sm font-medium text-[#2F4A3D]">Your name</span>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Dewik Bavishi"
                    className="mt-1 w-full rounded-lg border border-[#2F4A3D]/20 px-3 py-2 text-[#2F4A3D] outline-none focus:border-[#D9A92B] focus:ring-2 focus:ring-[#D9A92B]/30"
                  />
                </label>
              )}

              <label className="block">
                <span className="text-sm font-medium text-[#2F4A3D]">Email address</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="mt-1 w-full rounded-lg border border-[#2F4A3D]/20 px-3 py-2 text-[#2F4A3D] outline-none focus:border-[#D9A92B] focus:ring-2 focus:ring-[#D9A92B]/30"
                />
              </label>

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-[#1E4A35] py-2.5 font-medium text-[#FBF6EC] transition hover:bg-[#173a29] disabled:opacity-60"
              >
                {busy ? 'Sending...' : isSignup ? 'Create my account' : 'Email me a sign-in link'}
              </button>

              <p className="text-center text-xs text-[#2F4A3D]/60">
                No password needed. We send a link that signs you in.
              </p>

              {!isSignup && (
                <button
                  type="button"
                  onClick={() => {
                    setMode('password');
                    setMessage(null);
                  }}
                  className="w-full text-center text-xs text-[#2F4A3D]/60 underline"
                >
                  Sign in with a password instead
                </button>
              )}
            </form>
          )}

          {mode === 'password' && (
            <form onSubmit={signInWithPassword} className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-[#2F4A3D]">Email address</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="mt-1 w-full rounded-lg border border-[#2F4A3D]/20 px-3 py-2 text-[#2F4A3D] outline-none focus:border-[#D9A92B] focus:ring-2 focus:ring-[#D9A92B]/30"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-[#2F4A3D]">Password</span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="mt-1 w-full rounded-lg border border-[#2F4A3D]/20 px-3 py-2 text-[#2F4A3D] outline-none focus:border-[#D9A92B] focus:ring-2 focus:ring-[#D9A92B]/30"
                />
              </label>

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-[#1E4A35] py-2.5 font-medium text-[#FBF6EC] transition hover:bg-[#173a29] disabled:opacity-60"
              >
                {busy ? 'Signing in...' : 'Sign in'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode('email');
                  setPassword('');
                  setMessage(null);
                }}
                className="w-full text-center text-xs text-[#2F4A3D]/60 underline"
              >
                Email me a link instead
              </button>
            </form>
          )}

          {mode === 'phone' && !PHONE_ENABLED && (
            <div className="space-y-3 py-2 text-center">
              <p className="text-sm font-medium text-[#2F4A3D]">
                Mobile sign-in is not available yet.
              </p>
              <p className="text-xs text-[#2F4A3D]/70">
                We are still setting up text messages. Please use your email address for now -
                it works exactly the same way, and you can add your mobile number later.
              </p>
              <button
                type="button"
                onClick={() => {
                  setMode('email');
                  setMessage(null);
                }}
                className="w-full rounded-lg bg-[#1E4A35] py-2.5 font-medium text-[#FBF6EC] transition hover:bg-[#173a29]"
              >
                Use email instead
              </button>
            </div>
          )}

          {mode === 'phone' && PHONE_ENABLED && !codeSent && (
            <form onSubmit={sendCode} className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-[#2F4A3D]">Mobile number</span>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="98765 43210"
                  className="mt-1 w-full rounded-lg border border-[#2F4A3D]/20 px-3 py-2 text-[#2F4A3D] outline-none focus:border-[#D9A92B] focus:ring-2 focus:ring-[#D9A92B]/30"
                />
              </label>
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-[#1E4A35] py-2.5 font-medium text-[#FBF6EC] transition hover:bg-[#173a29] disabled:opacity-60"
              >
                {busy ? 'Sending...' : 'Send me a code'}
              </button>
              <p className="text-center text-xs text-[#2F4A3D]/60">
                Indian numbers assumed. We add +91 for you.
              </p>
            </form>
          )}

          {mode === 'phone' && PHONE_ENABLED && codeSent && (
            <form onSubmit={verifyCode} className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-[#2F4A3D]">6-digit code</span>
                <input
                  inputMode="numeric"
                  required
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="mt-1 w-full rounded-lg border border-[#2F4A3D]/20 px-3 py-2 text-center text-lg tracking-[0.4em] text-[#2F4A3D] outline-none focus:border-[#D9A92B] focus:ring-2 focus:ring-[#D9A92B]/30"
                />
              </label>
              <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="w-full rounded-lg bg-[#1E4A35] py-2.5 font-medium text-[#FBF6EC] transition hover:bg-[#173a29] disabled:opacity-60"
              >
                {busy ? 'Checking...' : 'Sign in'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCodeSent(false);
                  setCode('');
                  setMessage(null);
                }}
                className="w-full text-center text-xs text-[#2F4A3D]/60 underline"
              >
                Use a different number
              </button>
            </form>
          )}

          {message && (
            <div
              role="status"
              className={`mt-4 rounded-lg px-3 py-2 text-sm ${
                message.kind === 'ok'
                  ? 'bg-[#1E4A35]/10 text-[#1E4A35]'
                  : 'bg-red-50 text-red-700'
              }`}
            >
              <p>{message.text}</p>
              {message.offerSignup && (
                <Link
                  href={`/signup${nextQuery}`}
                  className="mt-1 inline-block font-medium underline"
                >
                  Create an account instead
                </Link>
              )}
            </div>
          )}
        </div>

        {/* The way between the two pages, in both directions. */}
        <p className="mt-6 text-center text-sm text-[#2F4A3D]/70">
          {isSignup ? (
            <>
              Already have an account?{' '}
              <Link href={`/login${nextQuery}`} className="font-medium text-[#1E4A35] underline">
                Sign in
              </Link>
            </>
          ) : (
            <>
              New to Ziventa?{' '}
              <Link href={`/signup${nextQuery}`} className="font-medium text-[#1E4A35] underline">
                Create an account
              </Link>
            </>
          )}
        </p>
      </div>
    </main>
  );
}

/** Supabase needs E.164 (+919876543210). Assume India if no country code given. */
function toE164(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (raw.trim().startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return `+${digits}`;
}
