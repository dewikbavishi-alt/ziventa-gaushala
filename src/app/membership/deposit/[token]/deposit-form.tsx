'use client';

import { useState } from 'react';

/**
 * Cash on delivery is deliberately absent.
 *
 * A deposit is what holds the seat - there is no delivery to attach it to and
 * nothing to hand over at a door. Leaving the option out is the point of this
 * page being separate from checkout rather than reusing it.
 */
const METHODS = [
  { value: 'UPI', label: 'UPI' },
  { value: 'Card', label: 'Card' },
  { value: 'Net Banking', label: 'Net Banking' },
] as const;

export function DepositForm({ token, amountLabel }: { token: string; amountLabel: string }) {
  const [method, setMethod] = useState<string>('UPI');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/membership/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The token identifies the membership; the amount is never sent,
        // because the server reads it from the record it already has.
        body: JSON.stringify({ token, method }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'We could not record that just now. Please try again.');
        return;
      }
      setDone(true);
    } catch {
      setError('We could not reach our server. Please check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mt-5 rounded-xl border border-[#1E4A35]/20 bg-[#1E4A35]/5 p-5 text-center">
        <p className="font-display text-lg text-[#1E4A35]">You are a member.</p>
        <p className="mt-1 text-sm text-[#2F4A3D]/75">
          Your deposit is recorded and your seat is now active. We have emailed you the details.
        </p>
        <a
          href="/your-account/membership"
          className="mt-4 inline-block rounded-lg bg-[#1E4A35] px-5 py-2.5 text-sm font-medium text-[#FBF6EC] transition hover:bg-[#173a29]"
        >
          See your membership
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={pay} className="mt-5">
      <fieldset>
        <legend className="text-sm font-medium text-[#2F4A3D]">How would you like to pay?</legend>
        <div className="mt-2 flex flex-col gap-2">
          {METHODS.map((m) => (
            <label
              key={m.value}
              className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border px-4 py-2 text-sm transition ${
                method === m.value
                  ? 'border-[#C08A2E] bg-[#C08A2E]/8 text-[#2F4A3D]'
                  : 'border-[#2F4A3D]/20 text-[#2F4A3D]/80 hover:border-[#C08A2E]/50'
              }`}
            >
              <input
                type="radio"
                name="method"
                value={m.value}
                checked={method === m.value}
                onChange={() => setMethod(m.value)}
                className="h-4 w-4 accent-[#C08A2E]"
              />
              {m.label}
            </label>
          ))}
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="mt-4 min-h-[44px] w-full rounded-lg bg-[#1E4A35] px-5 font-medium text-[#FBF6EC] transition hover:bg-[#173a29] disabled:opacity-60"
      >
        {busy ? 'Recording…' : `Pay ${amountLabel}`}
      </button>

      {/* The same admission checkout makes. It is not a real charge yet. */}
      <p className="mt-3 flex items-start gap-2 rounded-lg bg-[#C08A2E]/10 px-3 py-2 text-xs text-[#2F4A3D]">
        <span aria-hidden="true">ⓘ</span>
        <span>
          <strong>Demonstration payment.</strong> No card or bank details are collected and nothing
          is charged. Connect a payment provider to take the deposit for real.
        </span>
      </p>
    </form>
  );
}
