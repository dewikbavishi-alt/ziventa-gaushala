import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/** The live catalogue, so prices come from the database rather than the page. */
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
      imagePath: true,
    },
  });

  return NextResponse.json(
    { products },
    { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } },
  );
}
