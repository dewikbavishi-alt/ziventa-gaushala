import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { DEPOSIT_PAISE } from '@/lib/membership';
import { SiteFooter } from '@/components/site-footer';
import { DepositForm } from './deposit-form';

export const metadata: Metadata = {
  title: 'Pay your deposit',
  description: 'Pay the refundable founding deposit for your Ziventa Gir Gold Club seat.',
  // A private link. Nothing here should ever appear in a search result.
  robots: { index: false, follow: false },
};

/** Never cached: the state of the deposit is the entire point of the page. */
export const dynamic = 'force-dynamic';

const rs = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 0 })}`;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[#FBF6EC]">
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <a href="/" aria-label="Ziventa Gaushala home" className="mb-8 flex flex-col items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo/ziventa-symbol.svg" alt="" width={100} height={100} className="mb-3 h-14 w-14" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo/ziventa-logo.svg" alt="Ziventa" width={329} height={86} className="h-8 w-auto" />
            <span className="mt-1 block text-[0.6rem] font-semibold tracking-[0.42em] text-[#8F6A1E] uppercase">
              Gaushala
            </span>
          </a>
          {children}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <Shell>
      <div className="rounded-2xl border border-[#2F4A3D]/10 bg-white p-6 text-center shadow-sm">
        <h1 className="font-display text-xl text-[#2F4A3D]">{title}</h1>
        <p className="mt-2 text-sm text-[#2F4A3D]/70">{body}</p>
        <a
          href="/"
          className="mt-5 inline-block rounded-lg bg-[#1E4A35] px-5 py-2.5 text-sm font-medium text-[#FBF6EC] transition hover:bg-[#173a29]"
        >
          Back to the gaushala
        </a>
      </div>
    </Shell>
  );
}

export default async function DepositPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  /**
   * Looked up by token only. The page never takes a membership id or an email
   * from the URL, so there is nothing to change to reach somebody else's seat.
   */
  const membership = await prisma.membership.findUnique({
    where: { depositToken: token },
    select: {
      seatNumber: true,
      depositPaise: true,
      depositStatus: true,
      status: true,
      customer: { select: { fullName: true, email: true } },
    },
  });

  if (!membership) {
    /**
     * One message for a token that never existed and one that has already been
     * used, because the link is cleared the moment a deposit lands. Saying
     * which would tell someone holding a stale link whether a seat exists.
     */
    return (
      <Message
        title="This link is no longer active"
        body="It may already have been used, or it may have been replaced by a newer one. If you think your deposit is still outstanding, reply to the email we sent you and we will send a fresh link."
      />
    );
  }

  if (membership.seatNumber === null) {
    // The seat was released while this link was in someone's inbox. Releasing
    // clears the token too, so this is a belt-and-braces branch.
    return (
      <Message
        title="This membership has ended"
        body="The seat this link was for has been returned to the founding circle. If you think that is a mistake, reply to the email we sent you and we will put it right."
      />
    );
  }

  if (membership.depositStatus === 'PAID') {
    return (
      <Message
        title="This deposit is already paid"
        body={`Seat ${membership.seatNumber} is settled. Nothing further is needed.`}
      />
    );
  }

  const name = membership.customer.fullName?.trim() || 'there';
  const amount = membership.depositPaise || DEPOSIT_PAISE;

  return (
    <Shell>
      <div className="rounded-2xl border border-[#2F4A3D]/10 bg-white p-6 shadow-sm">
        <h1 className="font-display text-xl text-[#2F4A3D]">Your seat is confirmed</h1>
        <p className="mt-1 text-sm text-[#2F4A3D]/70">
          {name}, one step remains — the refundable founding deposit.
        </p>

        <dl className="mt-5 border-y border-dashed border-[#2F4A3D]/20 py-3 text-sm">
          <div className="flex justify-between py-1">
            <dt className="text-[#2F4A3D]/65">Your seat</dt>
            <dd className="font-semibold text-[#2F4A3D]">No. {membership.seatNumber} of 250</dd>
          </div>
          <div className="flex justify-between py-1">
            <dt className="text-[#2F4A3D]/65">Refundable deposit</dt>
            <dd className="font-semibold text-[#1E4A35]">{rs(amount)}</dd>
          </div>
        </dl>

        <DepositForm token={token} amountLabel={rs(amount)} />

        <p className="mt-4 text-xs text-[#2F4A3D]/60">
          The deposit is fully refundable and simply holds your seat in the founding circle.
        </p>
      </div>
    </Shell>
  );
}
