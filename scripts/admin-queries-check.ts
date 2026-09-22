/**
 * Runs every admin query against the real database and prints what it got.
 *
 *   npm run admin:check-queries
 *
 * Read-only. Catches SQL mistakes - wrong casts, bad timezone expressions,
 * a GROUP BY that drops rows - before they surface as a blank dashboard.
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();

async function main() {
  // Imported after the env is loaded; a top-level import is hoisted above it.
  const q = await import('../src/lib/admin/queries');
  const { parseRange } = await import('../src/lib/admin/range');
  const { prisma } = await import('../src/lib/prisma');

  const r = parseRange({ range: '30d' });
  const all = parseRange({ range: 'custom', from: '2026-01-01', to: '2026-12-31' });
  let failed = 0;

  async function run(name: string, fn: () => Promise<unknown>) {
    try {
      const out = await fn();
      const text = JSON.stringify(out, (_k, v) => (typeof v === 'bigint' ? Number(v) : v));
      console.log(`  ok    ${name}: ${text.length > 180 ? text.slice(0, 180) + '...' : text}`);
    } catch (e) {
      failed += 1;
      console.log(`  FAIL  ${name}: ${(e as Error).message.split('\n').slice(-3).join(' ').slice(0, 300)}`);
    }
  }

  console.log(`range: ${r.label} (${r.bucket})\n`);

  await run('salesWindows', () => q.salesWindows());
  await run('salesTotals 30d', () => q.salesTotals(r.start, r.end));
  await run('salesTotals 2026', () => q.salesTotals(all.start, all.end));
  await run('revenueSeries (non-zero buckets)', async () =>
    (await q.revenueSeries(all)).filter((p) => p.value > 0),
  );
  await run('revenueSeries bucket count', async () => (await q.revenueSeries(r)).length);
  await run('cancellationSeries', async () => (await q.cancellationSeries(r)).length);
  await run('cancellationReasons', () => q.cancellationReasons(all.start, all.end));
  await run('orderStatusCounts', () => q.orderStatusCounts(all.start, all.end));
  await run('paymentStatusCounts', () => q.paymentStatusCounts(all.start, all.end));
  await run('paymentMethods', () => q.paymentMethods(all.start, all.end));
  await run('productCounts', () => q.productCounts());
  await run('productPerformance top 3', async () =>
    (await q.productPerformance(all.start, all.end)).slice(0, 3).map((p) => ({
      name: p.name, units: p.units, revenue: p.revenue, orders: p.orders, state: p.state,
    })),
  );
  await run('productPerformance sort=name asc', async () =>
    (await q.productPerformance(all.start, all.end, { sort: 'name', dir: 'asc' })).map((p) => p.name),
  );
  await run('listOrders', async () => {
    const o = await q.listOrders({ start: all.start, end: all.end });
    return { total: o.total, pages: o.pages, first: o.rows[0]?.orderNumber };
  });
  await run('listOrders search ignores range', async () => {
    const o = await q.listOrders({ start: r.start, end: r.start, q: 'ZV-260907' });
    return o.rows.map((x) => x.orderNumber);
  });
  await run('recentOrders', async () => (await q.recentOrders(3)).map((o) => o.orderNumber));
  await run('getOrder (bad id -> null)', () => q.getOrder('not-a-uuid'));
  await run('customerCounts', () => q.customerCounts(all.start, all.end));
  await run('customerGrowth', async () => (await q.customerGrowth(all)).filter((p) => p.value > 0));
  await run('listCustomers', async () => {
    const c = await q.listCustomers({});
    return { total: c.total, rows: c.rows.map((x) => ({ email: x.email, orders: x.orders, spent: x.spent })) };
  });
  await run('listCustomers search + filter', async () =>
    (await q.listCustomers({ q: 'dewik', filter: 'buyers', sort: 'spent' })).total,
  );
  await run("listCustomers search with % in it (escaped)", async () =>
    (await q.listCustomers({ q: '100%' })).total,
  );
  await run('visitorTotals', () => q.visitorTotals(r.start, r.end));
  await run('visitorWindows', () => q.visitorWindows());
  await run('visitorSeries', async () => (await q.visitorSeries(r)).length);
  await run('visitorBreakdown', () => q.visitorBreakdown(r.start, r.end));

  await prisma.$disconnect();
  console.log(failed ? `\n${failed} FAILED` : '\nAll admin queries ran.');
  process.exit(failed ? 1 : 0);
}

main();
