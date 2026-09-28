'use client';

import { useActionState } from 'react';
import { setDefaultAddress, deleteAddress, type AddressResult } from './actions';

/**
 * One saved address, with the two things you can do to it.
 *
 * Two separate forms rather than one with two submit buttons, so each keeps
 * its own pending flag and its own message - and so both still work with no
 * JavaScript, as real forms posting to a Server Function.
 */
export function AddressCard({
  id,
  label,
  isDefault,
  lines,
  usedByOrders,
}: {
  id: string;
  label: string | null;
  isDefault: boolean;
  lines: string;
  usedByOrders: number;
}) {
  const [defaultResult, makeDefault, settingDefault] = useActionState<
    AddressResult | null,
    FormData
  >(setDefaultAddress, null);

  const [removeResult, remove, removing] = useActionState<AddressResult | null, FormData>(
    deleteAddress,
    null,
  );

  const message = removeResult ?? defaultResult;

  return (
    <article className="flex flex-col rounded-2xl border border-[#2F4A3D]/12 bg-white p-5 text-sm text-[#2F4A3D]/85">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {label && <h2 className="font-semibold text-[#2F4A3D]">{label}</h2>}
        {isDefault && (
          <span className="rounded bg-[#1E4A35]/10 px-2 py-0.5 text-xs font-medium text-[#1E4A35]">
            Default
          </span>
        )}
      </div>

      <address className="not-italic leading-relaxed">{lines}</address>

      {usedByOrders > 0 && (
        <p className="mt-2 text-xs text-[#2F4A3D]/55">
          {usedByOrders === 1 ? 'Used for 1 order' : `Used for ${usedByOrders} orders`}
        </p>
      )}

      {/* Pushed to the bottom so cards of different heights line their buttons up. */}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        {!isDefault && (
          <form action={makeDefault}>
            <input type="hidden" name="addressId" value={id} />
            <button
              type="submit"
              disabled={settingDefault}
              className="min-h-[44px] rounded-lg border border-[#1E4A35]/30 px-3 py-2 text-xs font-medium text-[#1E4A35] transition hover:bg-[#1E4A35]/5 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E4A35]"
            >
              {settingDefault ? 'Saving...' : 'Use this by default'}
            </button>
          </form>
        )}

        <form action={remove}>
          <input type="hidden" name="addressId" value={id} />
          <button
            type="submit"
            disabled={removing}
            className="min-h-[44px] rounded-lg px-3 py-2 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          >
            {removing ? 'Removing...' : 'Remove'}
          </button>
        </form>
      </div>

      {message && (
        <p
          role="status"
          className={`mt-2 text-xs ${message.ok ? 'text-[#1E4A35]' : 'text-red-700'}`}
        >
          {message.message}
        </p>
      )}
    </article>
  );
}
