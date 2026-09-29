import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/supabase/server';
import { memberRateApplies } from '@/lib/orders';
import { razorpayConfigured, razorpayIsLive } from '@/lib/payments/razorpay';

/**
 * Whether the checkout can take money, and whether it is real money.
 *
 * Global rather than per-visitor, but it rides along here because the static
 * landing page already calls this on load and a second request for two
 * booleans would be worse. Neither is a secret: the first is obvious from
 * trying to pay, and the second is something a customer is entitled to know
 * before typing a card number.
 */
function paymentState() {
  const configured = razorpayConfigured();
  return { payments: configured, paymentsLive: configured && razorpayIsLive() };
}
import { prisma } from '@/lib/prisma';

/**
 * Who is signed in, if anyone.
 *
 * The landing page is plain HTML, so it cannot read the session on the server.
 * It calls this on load to decide whether to show "You're not signed in", and
 * now also which of the two prices to display.
 *
 * Deliberately returns only what the page needs to render a name. No id, no
 * token, nothing that would be worth stealing from the browser.
 *
 * `member` here only decides what is SHOWN. Editing it in the browser changes
 * the displayed price and nothing else: the order route asks the database the
 * same question again, from the session, and charges on that answer.
 */
export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { signedIn: false, member: false, ...paymentState() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const label =
    (user.user_metadata?.full_name as string | undefined) ??
    user.email ??
    user.phone ??
    'your account';

  /**
   * The address checkout should offer back, if they have saved one.
   *
   * Only ever the signed-in person's own default, read from the session -
   * there is no id in the request to point somewhere else. It is a
   * convenience for filling a form they are about to fill anyway, and the
   * order route re-reads whatever is actually submitted, so editing this in
   * the browser changes the typing saved and nothing else.
   */
  const [member, address] = await Promise.all([
    memberRateApplies(user.id),
    prisma.address.findFirst({
      where: { customerId: user.id, isDefault: true },
      select: { line1: true, line2: true, city: true, state: true, postcode: true },
    }),
  ]);

  return NextResponse.json(
    { signedIn: true, label, member, address, ...paymentState() },
    // Never cache this - a shared cache would show one person's name, their
    // prices, and now their home address, to another.
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
