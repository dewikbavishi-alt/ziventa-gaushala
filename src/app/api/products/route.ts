import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * The live catalogue, so prices come from the database rather than the page.
 *
 * Both prices are public. The member rate is already printed on the landing
 * page beside the regular one - it is an advertised benefit, not a secret -
 * and publishing it here keeps this response cacheable for everyone. Which
 * rate a given person is CHARGED is decided per request in the order route,
 * never here.
 */
export async function GET() {
  const rows = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      slug: true,
      name: true,
      description: true,
      sizeLabel: true,
      pricePaise: true,
      memberPricePaise: true,
      imagePath: true,
      stockCount: true,
    },
  });

  /**
   * `soldOut` rather than the raw count.
   *
   * The shop only needs to know whether it can be bought, and deciding that
   * here keeps the rule in one place - null means the product is not counted
   * at all and is always available, which is easy to get backwards in a
   * template. It also means the exact number on the shelf is not published.
   *
   * A product switched off in the admin never appears in this list at all, so
   * the page has to treat "absent" as unavailable too, exactly as priceCart
   * already does when it refuses an order for one.
   */
  const products = rows.map(({ stockCount, ...p }) => ({ ...p, soldOut: stockCount === 0 }));

  return NextResponse.json(
    { products },
    {
      /**
       * Not cached. This was public/max-age=60, which was right when the
       * response was only names and prices, but stock has to be able to
       * change the shop the moment it is edited in the admin - a minute of a
       * CDN insisting a sold-out jar is buyable is a minute of orders that
       * have to be apologised for. The query is tiny and now runs in the same
       * region as the database.
       */
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
