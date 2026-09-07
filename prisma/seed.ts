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
    slug: 'ghee-250',
    name: 'Bilona Ghee - 250g',
    description: 'Small-batch, hand-churned A2 Gir ghee for everyday cooking.',
    sizeLabel: '250g',
    pricePaise: 80_000,
    sortOrder: 1,
  },
  {
    slug: 'ghee-500',
    name: 'Bilona Ghee - 500g',
    description: 'The household size. Same hand-churned batch, better value.',
    sizeLabel: '500g',
    pricePaise: 160_000,
    sortOrder: 2,
  },
  {
    slug: 'ghee-1kg',
    name: 'Bilona Ghee - 1kg',
    description: 'For families who cook with ghee daily.',
    sizeLabel: '1kg',
    pricePaise: 315_000,
    sortOrder: 3,
  },
  {
    slug: 'dhoop',
    name: 'Panchgavya Dhoop',
    description: 'Hand-rolled dhoop made from our own Panchgavya.',
    sizeLabel: 'Pack of 20',
    pricePaise: 25_000,
    sortOrder: 4,
  },
  {
    slug: 'ark',
    name: 'Gau Mutra Ark',
    description: 'Distilled and filtered, bottled in small batches.',
    sizeLabel: '500ml',
    pricePaise: 35_000,
    sortOrder: 5,
  },
  {
    slug: 'gift',
    name: 'Festive Gift Box',
    description: 'Ghee, dhoop and ark presented in a hand-packed box.',
    sizeLabel: 'Gift set',
    pricePaise: 420_000,
    sortOrder: 6,
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
