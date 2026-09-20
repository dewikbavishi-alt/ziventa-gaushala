import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentCustomer } from '@/lib/auth';
import { AccountShell } from '@/components/account/account-shell';
import { ProfileForm } from './profile-form';

export const metadata: Metadata = { title: 'Login & security' };

export default async function SecurityPage() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect('/login?next=%2Fyour-account%2Fsecurity');

  return (
    <AccountShell
      title="Login &amp; Security"
      description="Your name, mobile number and how you sign in."
      backHref="/your-account"
      backLabel="Your Account"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <section
          aria-labelledby="details-heading"
          className="rounded-2xl border border-[#2F4A3D]/12 bg-white p-6"
        >
          <h2
            id="details-heading"
            className="mb-4 text-sm font-semibold uppercase tracking-wide text-[#2F4A3D]/60"
          >
            Your details
          </h2>
          <ProfileForm fullName={customer.fullName ?? ''} phone={customer.phone ?? ''} />
        </section>

        <section
          aria-labelledby="signin-heading"
          className="rounded-2xl border border-[#2F4A3D]/12 bg-white p-6"
        >
          <h2
            id="signin-heading"
            className="mb-4 text-sm font-semibold uppercase tracking-wide text-[#2F4A3D]/60"
          >
            How you sign in
          </h2>

          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-[#2F4A3D]/60">Email address</dt>
              <dd className="mt-0.5 font-medium text-[#2F4A3D]">
                {customer.email ?? 'Not set'}
              </dd>
            </div>
            <div>
              <dt className="text-[#2F4A3D]/60">Sign-in method</dt>
              <dd className="mt-0.5 text-[#2F4A3D]">
                A one-time link sent to your email. No password to remember.
              </dd>
            </div>
          </dl>

          {/*
            Deliberately read-only. Changing the address on an account is a
            real flow - it has to be proved at BOTH addresses, or an attacker
            with a borrowed session walks off with the account. Showing an
            editable box that quietly did less than that would be worse than
            showing none, so this says what to do instead.
          */}
          <p className="mt-5 rounded-lg bg-[#FBF6EC] p-3 text-xs text-[#2F4A3D]/70">
            To change the email address on your account, write to{' '}
            <a
              className="font-medium underline underline-offset-2"
              href="mailto:hello@ziventagaushala.com?subject=Change%20my%20account%20email"
            >
              hello@ziventagaushala.com
            </a>{' '}
            and we will move your orders across for you.
          </p>
        </section>
      </div>
    </AccountShell>
  );
}
