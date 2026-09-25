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
  const products = await prisma.product.findMany({
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
    },
  });

  return NextResponse.json(
    { products },
    { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } },
  );
}
