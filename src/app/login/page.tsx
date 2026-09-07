'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Mode = 'email' | 'phone';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<Mode>('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  /** Email: send a magic link. No password to forget. */
  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setBusy(false);
    setMessage(
      error
        ? { kind: 'error', text: error.message }
        : { kind: 'ok', text: `Check ${email} for your sign-in link.` },
    );
  }

  /** Phone step 1: ask Supabase to text a 6-digit code. */
  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithOtp({ phone: toE164(phone) });
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
    router.push('/account');
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-[#FBF6EC] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-[#1E4A35] flex items-center justify-center">
            <span className="text-[#D9A92B] text-xl">&#10047;</span>
          </div>
          <h1 className="text-2xl font-semibold text-[#2F4A3D]">Ziventa Gaushala</h1>
          <p className="mt-1 text-sm text-[#2F4A3D]/70">Sign in to your account</p>
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
                  mode === m ? 'bg-white text-[#1E4A35] shadow-sm' : 'text-[#2F4A3D]/60'
                }`}
              >
                {m === 'email' ? 'Email' : 'Phone'}
              </button>
            ))}
          </div>

          {mode === 'email' && (
            <form onSubmit={sendMagicLink} className="space-y-4">
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
                {busy ? 'Sending...' : 'Email me a sign-in link'}
              </button>
              <p className="text-center text-xs text-[#2F4A3D]/60">
                No password needed. We send a link that signs you in.
              </p>
            </form>
          )}

          {mode === 'phone' && !codeSent && (
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

          {mode === 'phone' && codeSent && (
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
            <p
              role="status"
              className={`mt-4 rounded-lg px-3 py-2 text-sm ${
                message.kind === 'ok'
                  ? 'bg-[#1E4A35]/10 text-[#1E4A35]'
                  : 'bg-red-50 text-red-700'
              }`}
            >
              {message.text}
            </p>
          )}
        </div>
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
