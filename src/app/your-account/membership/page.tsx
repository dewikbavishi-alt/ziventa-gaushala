import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentCustomer } from '@/lib/auth';
import { AccountShell } from '@/components/account/account-shell';

export const metadata: Metadata = { title: 'Gir Gold Club' };

const rs = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/** Database words are not customer words. */
const STATUS_TEXT: Record<string, string> = {
  PENDING: 'Awaiting confirmation',
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  CANCELLED: 'Cancelled',
};

const DEPOSIT_TEXT: Record<string, string> = {
  UNPAID: 'Not yet paid',
  PAID: 'Paid',
  REFUNDED: 'Refunded',
};

export default async function MembershipPage() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect('/login?next=%2Fyour-account%2Fmembership');

  const m = customer.membership;

  return (
    <AccountShell
      title="Gir Gold Club"
      description="Your founding membership."
      backHref="/your-account"
      backLabel="Your Account"
    >
      {m ? (
        <div className="rounded-2xl border border-[#2F4A3D]/12 bg-white p-6 sm:p-8">
          <p className="text-sm text-[#2F4A3D]/60">Your seat</p>
          <p className="mt-1 text-4xl font-semibold text-[#1E4A35]">Seat {m.seatNumber}</p>
          <p className="mt-1 text-sm text-[#2F4A3D]/65">One of only 250 founding families.</p>

          <dl className="mt-6 grid gap-4 border-t border-[#2F4A3D]/10 pt-5 sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-wide text-[#2F4A3D]/55">Status</dt>
              <dd className="mt-1 font-medium text-[#2F4A3D]">
                {STATUS_TEXT[m.status] ?? m.status}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-[#2F4A3D]/55">Deposit</dt>
              <dd className="mt-1 font-medium text-[#2F4A3D]">
                {rs(m.depositPaise)} &middot; {DEPOSIT_TEXT[m.depositStatus] ?? m.depositStatus}
              </dd>
            </div>
            {m.joinedOn && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-[#2F4A3D]/55">Member since</dt>
                <dd className="mt-1 font-medium text-[#2F4A3D]">
                  {new Intl.DateTimeFormat('en-IN', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  }).format(m.joinedOn)}
                </dd>
              </div>
            )}
          </dl>

          <p className="mt-6 rounded-lg bg-[#FBF6EC] p-3 text-xs text-[#2F4A3D]/70">
            The deposit is fully refundable. To ask anything about your membership, write to{' '}
            <a
              className="font-medium underline underline-offset-2"
              href="mailto:hello@ziventagaushala.com?subject=Gir%20Gold%20Club"
            >
              hello@ziventagaushala.com
            </a>
            .
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[#2F4A3D]/25 bg-white/60 p-10 text-center">
          <p className="text-lg text-[#2F4A3D]">You are not a member yet.</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#2F4A3D]/65">
            Founding membership is limited to 250 families. We speak to every family personally
            before a seat is confirmed, and there is nothing to pay until then.
          </p>
          <a
            href="/#join"
            className="mt-5 inline-block rounded-lg bg-[#1E4A35] px-5 py-2.5 text-sm font-medium text-[#FBF6EC] transition hover:bg-[#173a29] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E4A35]"
          >
            Reserve a place
          </a>
        </div>
      )}
    </AccountShell>
  );
}
