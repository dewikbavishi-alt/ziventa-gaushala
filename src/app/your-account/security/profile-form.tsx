'use client';

import { useActionState } from 'react';
import { updateProfile, type ProfileResult } from './actions';

/**
 * Name and mobile, editable.
 *
 * useActionState keeps the pending flag and the result next to the form
 * without any state of our own, and the form still submits if JavaScript
 * never loads - it is a real form posting to a Server Function, not a fetch
 * dressed up as one.
 */
export function ProfileForm({
  fullName,
  phone,
}: {
  fullName: string;
  phone: string;
}) {
  const [result, action, pending] = useActionState<ProfileResult | null, FormData>(
    updateProfile,
    null,
  );

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="fullName" className="block text-sm font-medium text-[#2F4A3D]">
          Your name
        </label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          defaultValue={fullName}
          autoComplete="name"
          maxLength={120}
          placeholder="Dewik Bavishi"
          className="mt-1 w-full rounded-lg border border-[#2F4A3D]/20 px-3 py-2 text-[#2F4A3D] outline-none focus:border-[#C08A2E] focus:ring-2 focus:ring-[#C08A2E]/30"
        />
      </div>

      <div>
        <label htmlFor="phone" className="block text-sm font-medium text-[#2F4A3D]">
          Mobile number
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={phone}
          autoComplete="tel"
          maxLength={30}
          placeholder="98765 43210"
          aria-describedby="phone-hint"
          className="mt-1 w-full rounded-lg border border-[#2F4A3D]/20 px-3 py-2 text-[#2F4A3D] outline-none focus:border-[#C08A2E] focus:ring-2 focus:ring-[#C08A2E]/30"
        />
        <p id="phone-hint" className="mt-1 text-xs text-[#2F4A3D]/60">
          We call this number to confirm your delivery slot.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[#1E4A35] px-5 py-2.5 text-sm font-medium text-[#FBF6EC] transition hover:bg-[#173a29] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E4A35]"
        >
          {pending ? 'Saving...' : 'Save changes'}
        </button>

        {result && (
          <p
            role="status"
            className={`text-sm ${result.ok ? 'text-[#1E4A35]' : 'text-red-700'}`}
          >
            {result.message}
          </p>
        )}
      </div>
    </form>
  );
}
