import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

/**
 * Idempotent seed - safe to re-run. Uses upsert on natural keys so it never
 * duplicates rows or clobbers edits made in the Supabase dashboard.
 *
 * Runs through DATABASE_URL (the pooler), which is deliberate: it exercises
 * the same connection path the deployed app will use.
 */
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

/** Prices in integer paise, matching the landing page exactly. */
const products = [
  {
    slug: 'ghee-500',
    name: 'Bilona Ghee - 500ml',
    description: 'The household size. Small-batch A2 Gir ghee, curd-churned the Bilona way.',
    sizeLabel: '500ml',
    pricePaise: 370_000,
    memberPricePaise: 277_500,
    sortOrder: 1,
  },
  {
    // Slug kept from when this was sold as 1kg: carts and order history refer to it.
    slug: 'ghee-1kg',
    name: 'Bilona Ghee - 1000ml',
    description: 'For families who cook with ghee daily.',
    sizeLabel: '1000ml',
    pricePaise: 699_900,
    memberPricePaise: 525_000,
    sortOrder: 2,
  },
];

/** The four cows named on the herd section of the site. */
const cows = [
  { name: 'Kamdhenu', description: 'The matriarch of the Ziventa herd.' },
  { name: 'Radha', description: 'Gentle, and the first to greet visitors.' },
  { name: 'Ganga', description: 'Our steadiest milker through the seasons.' },
  { name: 'Nandini', description: 'The youngest of the founding four.' },
];

async function main() {
  for (const p of products) {
    await prisma.product.upsert({ where: { slug: p.slug }, update: p, create: p });
  }
  for (const c of cows) {
    await prisma.cow.upsert({ where: { name: c.name }, update: c, create: c });
  }

  const [productCount, cowCount] = await Promise.all([
    prisma.product.count(),
    prisma.cow.count(),
  ]);

  console.log(`Seeded. products=${productCount} cows=${cowCount}`);

  const catalogue = await prisma.product.findMany({
    orderBy: { sortOrder: 'asc' },
    select: { slug: true, name: true, pricePaise: true },
  });
  for (const p of catalogue) {
    console.log(`  ${p.slug.padEnd(10)} ${p.name.padEnd(24)} Rs ${(p.pricePaise / 100).toFixed(2)}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
