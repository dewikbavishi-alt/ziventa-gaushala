import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

/**
 * Checks that the database matches what the schema promises - and, crucially,
 * that the CHECK constraints actually reject bad data.
 *
 * "The migration applied" is not the same as "the rules work". This asserts
 * the rules by trying to break them.
 *
 *   npm run db:verify
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

/** Asserts that a statement is REJECTED by a check constraint. */
async function mustReject(name: string, sql: string) {
  try {
    await prisma.$executeRawUnsafe(sql);
    check(name, false, '-> was ACCEPTED but should have been rejected');
  } catch (err) {
    const msg = (err as Error).message;
    check(
      name,
      /check constraint/i.test(msg),
      `-> rejected for the wrong reason: ${msg.slice(0, 90)}`,
    );
  }
}

async function main() {
  console.log('\nSchema\n');
  const rows = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name`;
  const names = rows.map((r) => r.table_name);
  for (const t of [
    'addresses', 'cows', 'customers', 'health_reports', 'leads',
    'memberships', 'order_items', 'orders', 'products', 'reviews',
  ]) {
    check(`table ${t}`, names.includes(t));
  }

  console.log('\nSeed data\n');
  check('6 products seeded', (await prisma.product.count()) === 6);
  check('4 cows seeded', (await prisma.cow.count()) === 4);

  console.log('\nConstraints reject bad data\n');

  await mustReject(
    'product price must be > 0',
    `INSERT INTO products (id,slug,name,"pricePaise","updatedAt") VALUES (gen_random_uuid(),'_verify_tmp','t',0,now())`,
  );

  await mustReject(
    'review rating cannot be 6',
    `INSERT INTO reviews (id,"authorName",rating,body) VALUES (gen_random_uuid(),'t',6,'x')`,
  );

  await mustReject(
    'order total must equal subtotal + shipping',
    `INSERT INTO orders (id,"orderNumber","contactName","contactEmail","contactPhone","shipLine1","shipCity","shipState","shipPostcode","subtotalPaise","shippingPaise","totalPaise","updatedAt")
     VALUES (gen_random_uuid(),'_VERIFY_TMP','t','t@x.com','1','l','c','s','000000',10000,9900,99999,now())`,
  );

  // The seat-cap tests need a customer row to satisfy the foreign key.
  const cid = '00000000-0000-4000-8000-0000000c0ffee'.slice(0, 36);
  await prisma.$executeRawUnsafe(
    `INSERT INTO customers (id,"updatedAt") VALUES ('${cid}',now()) ON CONFLICT (id) DO NOTHING`,
  );

  await mustReject(
    'membership seat 251 is impossible (250-family cap)',
    `INSERT INTO memberships (id,"customerId","seatNumber","updatedAt") VALUES (gen_random_uuid(),'${cid}',251,now())`,
  );

  await mustReject(
    'membership seat 0 is impossible',
    `INSERT INTO memberships (id,"customerId","seatNumber","updatedAt") VALUES (gen_random_uuid(),'${cid}',0,now())`,
  );

  // ...and prove the constraint is not simply blocking everything.
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO memberships (id,"customerId","seatNumber","updatedAt") VALUES (gen_random_uuid(),'${cid}',250,now())`,
    );
    check('membership seat 250 IS accepted', true);
  } catch (err) {
    check('membership seat 250 IS accepted', false, (err as Error).message.slice(0, 90));
  }

  // Clean up everything this run created.
  await prisma.$executeRawUnsafe(`DELETE FROM memberships WHERE "customerId" = '${cid}'`);
  await prisma.$executeRawUnsafe(`DELETE FROM customers WHERE id = '${cid}'`);
  await prisma.$executeRawUnsafe(`DELETE FROM products WHERE slug = '_verify_tmp'`);
  check('test rows cleaned up', (await prisma.customer.count({ where: { id: cid } })) === 0);

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
