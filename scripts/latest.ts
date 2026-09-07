import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

/**
 * Quick look at the newest leads and orders.
 *
 *   npm run db:latest
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const rs = (paise: number) => `Rs ${(paise / 100).toFixed(2)}`;

async function main() {
  const leads = await prisma.lead.findMany({ orderBy: { createdAt: 'desc' }, take: 3 });
  console.log(`\nLeads (${await prisma.lead.count()} total)\n`);
  for (const l of leads) {
    console.log(`  ${l.fullName} | ${l.email} | ${l.city ?? '-'} | ${l.status}`);
  }

  const orders = await prisma.order.findMany({
    orderBy: { placedAt: 'desc' },
    take: 3,
    include: { items: true },
  });
  console.log(`\nOrders (${await prisma.order.count()} total)\n`);
  for (const o of orders) {
    console.log(`  ${o.orderNumber}  ${o.status}  ${o.contactName} <${o.contactEmail}>`);
    console.log(`    ${o.shipLine1}, ${o.shipCity} ${o.shipPostcode}`);
    for (const i of o.items) {
      console.log(`    ${i.quantity} x ${i.productName.padEnd(22)} @ ${rs(i.unitPricePaise)}`);
    }
    console.log(
      `    subtotal ${rs(o.subtotalPaise)}  shipping ${rs(o.shippingPaise)}  total ${rs(o.totalPaise)}`,
    );
    console.log(`    linked to an account: ${o.customerId ? 'yes' : 'no (guest)'}`);
  }
  console.log('');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
