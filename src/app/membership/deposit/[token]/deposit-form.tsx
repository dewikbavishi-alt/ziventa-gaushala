'use client';

import { useState } from 'react';

/**
 * Pays the founding deposit through Razorpay Checkout.
 *
 * Pressing Pay asks our server for a gateway order (../../../api/membership/
 * deposit), opens Razorpay's window - which handles UPI, cards and net
 * banking itself - and, once it reports success, sends the signed result to
 * be verified. The membership is activated by the server only after that
 * signature checks out, never by this component. If the tab closes after
 * paying, Razorpay's webhook settles it instead.
 */

type RazorpayResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type RazorpayInstance = {
  open: () => void;
  on: (event: 'payment.failed', cb: (e: { error?: { description?: string } }) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

let loading: Promise<void> | null = null;

/** Razorpay's script, loaded only when someone actually pays. */
function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(
        new Error(
          'The payment window could not load. Check your connection and try again — nothing has been charged.',
        ),
      );
    };
    document.head.appendChild(s);
  });
  return loading;
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong. Please try again.');
  return data;
}

export function DepositForm({ token, amountLabel }: { token: string; amountLabel: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const start = await postJson('/api/membership/deposit', { token });
      if (start.alreadyPaid) {
        setDone(true);
        return;
      }
      const p = start.payment;
      await loadRazorpay();

      const paid = await new Promise<RazorpayResponse>((resolve, reject) => {
        const Razorpay = window.Razorpay;
        if (!Razorpay) {
          reject(new Error('The payment window could not load. Nothing has been charged.'));
          return;
        }
        const rzp = new Razorpay({
          key: p.keyId,
          order_id: p.orderId,
          amount: p.amountPaise,
          currency: 'INR',
          name: 'Ziventa Nutriments',
          description: `Founding deposit · Seat ${p.seatNumber}`,
          prefill: p.prefill,
          theme: { color: '#1E4A35' },
          handler: (r: RazorpayResponse) => resolve(r),
          modal: {
            ondismiss: () =>
              reject(new Error('Payment was not completed, so nothing has been charged. You can try again.')),
            escape: true,
            confirm_close: true,
          },
        });
        rzp.on('payment.failed', (ev) =>
          reject(
            new Error(
              ev?.error?.description ??
                'The payment did not go through. Nothing has been charged — you can try again.',
            ),
          ),
        );
        rzp.open();
      });

      await postJson('/api/membership/deposit/verify', paid);
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mt-5 rounded-xl border border-[#1E4A35]/20 bg-[#1E4A35]/5 p-5 text-center">
        <p className="font-display text-lg text-[#1E4A35]">You are a member.</p>
        <p className="mt-1 text-sm text-[#2F4A3D]/75">
          Your deposit is paid and your seat is now active. We have emailed you the details.
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
      <p className="text-sm text-[#2F4A3D]/75">
        Pay securely by UPI, card or net banking. The deposit is fully refundable.
      </p>

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
        {busy ? 'Opening secure payment…' : `Pay ${amountLabel}`}
      </button>
    </form>
  );
}
