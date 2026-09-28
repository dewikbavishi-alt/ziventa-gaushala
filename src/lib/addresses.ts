import type { Prisma } from '@/generated/prisma/client';

export type AddressInput = {
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postcode: string;
  country: string;
};

/**
 * What makes two addresses "the same place".
 *
 * Ordering twice to the same house should not leave two entries to choose
 * between, and people do not retype an address identically - "Flat 3" one
 * time, "flat  3" the next. Case and runs of whitespace are ignored for the
 * comparison only; what gets stored is exactly what was typed.
 *
 * The label is deliberately not part of this. Renaming "Home" to "Mum's"
 * describes the same doorstep.
 */
function sameness(a: AddressInput): string {
  const norm = (v: string | null | undefined) => (v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  return [a.line1, a.line2, a.city, a.state, a.postcode, a.country].map(norm).join('|');
}

/**
 * Attach the address an order was placed with to the account that placed it,
 * and hand back its id so the order can point at it.
 *
 * Runs inside the order transaction. If anything later in that transaction
 * fails, this is rolled back with it - an address saved for an order that was
 * never recorded would be a puzzle to the person who later finds it listed.
 *
 * Guests are not handled here at all: the caller only invokes this when there
 * is a customerId, because there is no account to save anything to otherwise
 * and the order keeps its own copy of the address regardless.
 */
export async function attachAddressToCustomer(
  tx: Prisma.TransactionClient,
  customerId: string,
  input: AddressInput,
): Promise<string> {
  const existing = await tx.address.findMany({
    where: { customerId },
    select: {
      id: true,
      line1: true,
      line2: true,
      city: true,
      state: true,
      postcode: true,
      country: true,
    },
  });

  const wanted = sameness(input);
  const match = existing.find((e) => sameness(e) === wanted);
  if (match) return match.id;

  const created = await tx.address.create({
    data: {
      customerId,
      line1: input.line1,
      line2: input.line2 || null,
      city: input.city,
      state: input.state,
      postcode: input.postcode,
      country: input.country,
      // The first address someone saves is the one to offer back to them.
      // Later ones do not steal the default - that is theirs to choose.
      isDefault: existing.length === 0,
    },
    select: { id: true },
  });

  return created.id;
}
