/**
 * Where an order has got to, drawn from the timestamps already stored on it.
 *
 * Not decoration: each step lights up only when its date exists, so the line
 * reflects what actually happened rather than guessing from the current
 * status. "Placed" is always true; the rest fill in as the order moves.
 *
 * Cancelled and returned orders get a plain sentence instead. Showing four
 * greyed-out steps for an order that will never move again is just clutter.
 */

const STEPS = [
  { key: 'placed', label: 'Placed' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'packed', label: 'Packed' },
  { key: 'sent', label: 'On its way' },
  { key: 'delivered', label: 'Delivered' },
] as const;

/** How far along the line an order is. -1 means it is not on the line at all. */
function reached(status: string): number {
  switch (status) {
    case 'PENDING':
      return 0;
    case 'CONFIRMED':
      return 1;
    case 'PROCESSING':
      return 2;
    case 'DISPATCHED':
    case 'OUT_FOR_DELIVERY':
      return 3;
    case 'DELIVERED':
      return 4;
    default:
      return -1; // cancelled or returned
  }
}

const dayOnly = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
});

export function OrderProgress({
  status,
  placedAt,
  confirmedAt,
  dispatchedAt,
  deliveredAt,
}: {
  status: string;
  placedAt: Date;
  confirmedAt?: Date | null;
  dispatchedAt?: Date | null;
  deliveredAt?: Date | null;
}) {
  const at = reached(status);

  if (at === -1) {
    return (
      <p className="rounded-xl bg-[#2F4A3D]/5 px-3 py-2 text-sm text-[#2F4A3D]/70">
        {status === 'CANCELLED'
          ? 'This order was cancelled. Nothing was charged.'
          : 'This order was returned.'}
      </p>
    );
  }

  const dates = [placedAt, confirmedAt, confirmedAt, dispatchedAt, deliveredAt];
  const pct = (at / (STEPS.length - 1)) * 100;

  return (
    <div>
      {/* The rail. aria-hidden because the list below says the same thing in words. */}
      <div aria-hidden="true" className="relative mx-[10%] mb-2 h-1 rounded-full bg-[#2F4A3D]/12">
        <div
          className="h-1 rounded-full bg-[#3F6B52] transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ol className="flex text-center">
        {STEPS.map((step, i) => {
          const done = i <= at;
          const current = i === at;
          const date = dates[i];
          return (
            <li key={step.key} className="flex-1" aria-current={current ? 'step' : undefined}>
              <span
                aria-hidden="true"
                className={`mx-auto -mt-[1.05rem] block h-3 w-3 rounded-full border-2 transition ${
                  done
                    ? 'border-[#3F6B52] bg-[#3F6B52]'
                    : 'border-[#2F4A3D]/25 bg-[#FBF6EC]'
                } ${current ? 'ring-4 ring-[#3F6B52]/20' : ''}`}
              />
              <span
                className={`mt-2 block text-[0.65rem] leading-tight sm:text-xs ${
                  done ? 'font-medium text-[#2F4A3D]' : 'text-[#2F4A3D]/45'
                }`}
              >
                {step.label}
                <span className="sr-only">{done ? ' - done' : ' - not yet'}</span>
              </span>
              {/* Only real dates are shown; a guessed one would be worse than none. */}
              {done && date && (
                <span className="mt-0.5 block text-[0.6rem] text-[#2F4A3D]/45">
                  {dayOnly.format(date)}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
