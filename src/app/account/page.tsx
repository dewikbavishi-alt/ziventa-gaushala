import { redirect } from 'next/navigation';
import { getCurrentCustomer } from '@/lib/auth';

/**
 * The signed-in area.
 *
 * The check happens here, next to the data - not in proxy.ts. Proxy runs
 * before the route and is easy to slip past, so it refreshes the session but
 * never decides who is allowed in.
 */
export default async function AccountPage() {
  const customer = await getCurrentCustomer();

  if (!customer) {
    redirect('/login');
  }

  const seat = customer.membership?.seatNumber;

  return (
    <main className="min-h-screen bg-[#FBF6EC] px-4 py-12">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-[#2F4A3D]">Your account</h1>
            <p className="mt-1 text-sm text-[#2F4A3D]/70">
              {customer.email ?? customer.phone ?? 'Signed in'}
            </p>
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="rounded-lg border border-[#2F4A3D]/20 px-3 py-1.5 text-sm text-[#2F4A3D] transition hover:bg-white"
            >
              Sign out
            </button>
          </form>
        </header>

        <section className="mb-6 rounded-2xl border border-[#2F4A3D]/10 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[#2F4A3D]/60">
            Gir Gold Club
          </h2>
          {seat ? (
            <div>
              <p className="text-3xl font-semibold text-[#1E4A35]">Seat {seat}</p>
              <p className="mt-1 text-sm text-[#2F4A3D]/70">
                Status: {customer.membership?.status.toLowerCase()} &middot; Deposit:{' '}
                {customer.membership?.depositStatus.toLowerCase()}
              </p>
            </div>
          ) : (
            <div>
              <p className="text-[#2F4A3D]">You are not a member yet.</p>
              <p className="mt-1 text-sm text-[#2F4A3D]/70">
                Founding membership is limited to 250 families.
              </p>
            </div>
          )}
        </section>

        <section className="grid grid-cols-2 gap-4">
          <div className="rounded-2xl border border-[#2F4A3D]/10 bg-white p-6">
            <p className="text-3xl font-semibold text-[#1E4A35]">{customer._count.orders}</p>
            <p className="mt-1 text-sm text-[#2F4A3D]/70">Orders</p>
          </div>
          <div className="rounded-2xl border border-[#2F4A3D]/10 bg-white p-6">
            <p className="text-3xl font-semibold text-[#1E4A35]">{customer._count.addresses}</p>
            <p className="mt-1 text-sm text-[#2F4A3D]/70">Saved addresses</p>
          </div>
        </section>
      </div>
    </main>
  );
}
