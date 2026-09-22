import 'server-only';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import {
  type Bucket,
  type DateRange,
  bucketKey,
  bucketStarts,
  startOfIstDay,
  startOfIstYear,
  stepIst,
  truncIst,
} from './range';

/**
 * Every admin figure, computed in the database.
 *
 * Nothing here loads rows to count them in JavaScript: totals are SUM and
 * COUNT, series are GROUP BY on a truncated date, and the only rows that ever
 * leave Postgres are ones about to be displayed. That is what keeps the
 * dashboard fast at ten thousand orders as well as at four.
 *
 * WHAT COUNTS AS A SALE - decided once, here, and used everywhere:
 *
 *   an order that is not CANCELLED and whose payment did not FAIL,
 *   valued at total minus anything refunded.
 *
 * Pending payments DO count. Every order on this site so far is cash on
 * delivery or UPI confirmed by phone, so payment is recorded after the fact;
 * counting only PAID orders would show a revenue of nil while orders are
 * plainly coming in. The Payments page reports what has actually been
 * collected, separately.
 */

const SALE = Prisma.sql`o."status" <> 'CANCELLED' AND o."paymentStatus" <> 'FAILED'`;
const NET = Prisma.sql`(o."totalPaise" - o."refundedPaise")`;

/** A UTC timestamp column, read as a wall-clock time in India. */
const ist = (col: Prisma.Sql) => Prisma.sql`((${col} AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')`;

/**
 * The bucket goes into SQL as a literal, not a parameter - date_trunc needs a
 * known unit to plan the query. Safe because it only ever comes from the
 * Bucket union, never from the request.
 */
const unit = (b: Bucket) => Prisma.raw(`'${b}'`);

const bucketExpr = (col: Prisma.Sql, b: Bucket) =>
  Prisma.sql`to_char(date_trunc(${unit(b)}, ${ist(col)}), 'YYYY-MM-DD"T"HH24')`;

/** Postgres COUNT/SUM come back as bigint; the dashboard wants numbers. */
const n = (v: unknown) => (v == null ? 0 : Number(v));

export interface SeriesPoint {
  key: string;
  at: Date;
  value: number;
  value2?: number;
}

/**
 * Put SQL rows onto every bucket in the range, filling gaps with zero.
 *
 * Without the fill, a day with no orders simply has no row, the chart joins
 * the neighbouring points, and a fortnight with two orders reads as steady
 * trade.
 */
function fill(
  range: Pick<DateRange, 'start' | 'end' | 'bucket'>,
  rows: { k: string; v: unknown; v2?: unknown }[],
): SeriesPoint[] {
  const byKey = new Map(rows.map((r) => [r.k, r]));
  return bucketStarts(range.start, range.end, range.bucket).map((at) => {
    const key = bucketKey(at);
    const row = byKey.get(key);
    return {
      key,
      at,
      value: n(row?.v),
      ...(row && 'v2' in row ? { value2: n(row.v2) } : { value2: 0 }),
    };
  });
}

// ============================================================ fixed windows

/** Today / this week / month / year / all time, in India time. */
function windows(now = new Date()) {
  const today = startOfIstDay(now);
  return {
    today,
    week: truncIst(now, 'week'),
    month: truncIst(now, 'month'),
    year: startOfIstYear(now),
    tomorrow: stepIst(today, 'day'),
  };
}

export async function salesWindows() {
  const w = windows();
  const [r] = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT
      COALESCE(SUM(${NET}) FILTER (WHERE o."placedAt" >= ${w.today}), 0)::float8 AS today,
      COALESCE(SUM(${NET}) FILTER (WHERE o."placedAt" >= ${w.week}),  0)::float8 AS week,
      COALESCE(SUM(${NET}) FILTER (WHERE o."placedAt" >= ${w.month}), 0)::float8 AS month,
      COALESCE(SUM(${NET}) FILTER (WHERE o."placedAt" >= ${w.year}),  0)::float8 AS year,
      COALESCE(SUM(${NET}), 0)::float8                                          AS all_time,
      COUNT(*)::int                                                             AS all_orders
    FROM orders o
    WHERE ${SALE}
  `;
  return {
    today: n(r.today),
    week: n(r.week),
    month: n(r.month),
    year: n(r.year),
    allTime: n(r.all_time),
    allOrders: n(r.all_orders),
  };
}

// ============================================================ sales in range

export async function salesTotals(start: Date, end: Date) {
  const [r] = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT
      COUNT(*) FILTER (WHERE ${SALE})::int                                    AS orders,
      COALESCE(SUM(${NET}) FILTER (WHERE ${SALE}), 0)::float8                  AS net,
      COALESCE(SUM(o."subtotalPaise") FILTER (WHERE ${SALE}), 0)::float8       AS gross,
      COALESCE(SUM(o."discountPaise") FILTER (WHERE ${SALE}), 0)::float8       AS discounts,
      COALESCE(SUM(o."shippingPaise") FILTER (WHERE ${SALE}), 0)::float8       AS shipping,
      COALESCE(SUM(o."taxPaise") FILTER (WHERE ${SALE}), 0)::float8            AS taxes,
      COALESCE(SUM(o."refundedPaise") FILTER (WHERE ${SALE}), 0)::float8       AS refunds,
      COUNT(*)::int                                                           AS all_orders,
      COUNT(*) FILTER (WHERE o."status" = 'CANCELLED')::int                   AS cancelled,
      COALESCE(SUM(o."totalPaise") FILTER (WHERE o."status" = 'CANCELLED'), 0)::float8 AS cancelled_value
    FROM orders o
    WHERE o."placedAt" >= ${start} AND o."placedAt" < ${end}
  `;

  const [items] = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT COALESCE(SUM(i."quantity"), 0)::int AS units
    FROM order_items i
    JOIN orders o ON o."id" = i."orderId"
    WHERE o."placedAt" >= ${start} AND o."placedAt" < ${end} AND ${SALE}
  `;

  const orders = n(r.orders);
  const net = n(r.net);
  const allOrders = n(r.all_orders);
  const cancelled = n(r.cancelled);

  return {
    orders,
    net,
    gross: n(r.gross),
    discounts: n(r.discounts),
    shipping: n(r.shipping),
    taxes: n(r.taxes),
    refunds: n(r.refunds),
    unitsSold: n(items.units),
    aov: orders ? net / orders : 0,
    allOrders,
    cancelled,
    cancelledValue: n(r.cancelled_value),
    cancellationRate: allOrders ? (cancelled / allOrders) * 100 : 0,
  };
}

export async function revenueSeries(range: DateRange) {
  const b = bucketExpr(Prisma.sql`o."placedAt"`, range.bucket);
  const rows = await prisma.$queryRaw<{ k: string; v: unknown; v2: unknown }[]>`
    SELECT ${b} AS k,
           COALESCE(SUM(${NET}) FILTER (WHERE ${SALE}), 0)::float8 AS v,
           COUNT(*) FILTER (WHERE ${SALE})::int                    AS v2
    FROM orders o
    WHERE o."placedAt" >= ${range.start} AND o."placedAt" < ${range.end}
    GROUP BY 1
  `;
  return fill(range, rows);
}

export async function cancellationSeries(range: DateRange) {
  const b = bucketExpr(Prisma.sql`o."placedAt"`, range.bucket);
  const rows = await prisma.$queryRaw<{ k: string; v: unknown; v2: unknown }[]>`
    SELECT ${b} AS k,
           COUNT(*) FILTER (WHERE o."status" = 'CANCELLED')::int AS v,
           COUNT(*)::int                                         AS v2
    FROM orders o
    WHERE o."placedAt" >= ${range.start} AND o."placedAt" < ${range.end}
    GROUP BY 1
  `;
  return fill(range, rows);
}

export async function cancellationReasons(start: Date, end: Date) {
  const rows = await prisma.$queryRaw<{ reason: string; c: unknown }[]>`
    SELECT COALESCE(NULLIF(TRIM(o."cancelReason"), ''), 'No reason given') AS reason,
           COUNT(*)::int AS c
    FROM orders o
    WHERE o."status" = 'CANCELLED' AND o."placedAt" >= ${start} AND o."placedAt" < ${end}
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 8
  `;
  return rows.map((r) => ({ reason: r.reason, count: n(r.c) }));
}

// ============================================================ status counts

export async function orderStatusCounts(start: Date, end: Date) {
  const rows = await prisma.order.groupBy({
    by: ['status'],
    where: { placedAt: { gte: start, lt: end } },
    _count: { _all: true },
    _sum: { totalPaise: true },
  });
  return rows.map((r) => ({
    status: r.status as string,
    count: r._count._all,
    value: r._sum.totalPaise ?? 0,
  }));
}

export async function paymentStatusCounts(start: Date, end: Date) {
  const rows = await prisma.order.groupBy({
    by: ['paymentStatus'],
    where: { placedAt: { gte: start, lt: end } },
    _count: { _all: true },
    _sum: { totalPaise: true, refundedPaise: true },
  });
  return rows.map((r) => ({
    status: r.paymentStatus as string,
    count: r._count._all,
    value: r._sum.totalPaise ?? 0,
    refunded: r._sum.refundedPaise ?? 0,
  }));
}

export async function paymentMethods(start: Date, end: Date) {
  // Checkout records the chosen method in notes as "Preferred payment: X".
  // Read from there until a payment gateway records it properly.
  const rows = await prisma.$queryRaw<{ method: string; c: unknown; v: unknown }[]>`
    SELECT COALESCE(
             NULLIF(o."paymentProvider", ''),
             NULLIF(substring(o."notes" FROM 'Preferred payment: ([A-Za-z ]+)'), ''),
             'Not recorded'
           ) AS method,
           COUNT(*)::int AS c,
           COALESCE(SUM(o."totalPaise"), 0)::float8 AS v
    FROM orders o
    WHERE o."placedAt" >= ${start} AND o."placedAt" < ${end}
    GROUP BY 1
    ORDER BY 2 DESC
  `;
  return rows.map((r) => ({ method: r.method.trim(), count: n(r.c), value: n(r.v) }));
}

// ============================================================ products

export type StockState = 'untracked' | 'out' | 'low' | 'in';

export function stockState(stock: number | null, threshold: number): StockState {
  if (stock == null) return 'untracked';
  if (stock <= 0) return 'out';
  if (stock <= threshold) return 'low';
  return 'in';
}

export async function productCounts() {
  const [r] = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT
      COUNT(*)::int                                                              AS total,
      COUNT(*) FILTER (WHERE p."isActive")::int                                  AS active,
      COUNT(*) FILTER (WHERE p."isActive" AND (p."stockCount" IS NULL OR p."stockCount" > 0))::int AS available,
      COUNT(*) FILTER (WHERE p."stockCount" IS NOT NULL AND p."stockCount" <= 0)::int             AS out_of_stock,
      COUNT(*) FILTER (WHERE p."stockCount" > 0 AND p."stockCount" <= p."lowStockThreshold")::int AS low_stock,
      COUNT(*) FILTER (WHERE p."stockCount" IS NULL)::int                        AS untracked,
      COALESCE(SUM(p."stockCount"), 0)::int                                      AS inventory
    FROM products p
  `;
  return {
    total: n(r.total),
    active: n(r.active),
    available: n(r.available),
    outOfStock: n(r.out_of_stock),
    lowStock: n(r.low_stock),
    untracked: n(r.untracked),
    inventory: n(r.inventory),
  };
}

export const PRODUCT_SORTS = {
  revenue: Prisma.raw('revenue'),
  units: Prisma.raw('units'),
  orders: Prisma.raw('orders'),
  stock: Prisma.raw('p."stockCount"'),
  name: Prisma.raw('p."name"'),
} as const;
export type ProductSort = keyof typeof PRODUCT_SORTS;

export interface ProductRow {
  id: string;
  name: string;
  slug: string;
  sizeLabel: string | null;
  imagePath: string | null;
  isActive: boolean;
  pricePaise: number;
  stockCount: number | null;
  lowStockThreshold: number;
  units: number;
  revenue: number;
  orders: number;
  state: StockState;
}

export async function productPerformance(
  start: Date,
  end: Date,
  opts: { sort?: ProductSort; dir?: 'asc' | 'desc'; limit?: number } = {},
): Promise<ProductRow[]> {
  const sortCol = PRODUCT_SORTS[opts.sort ?? 'revenue'] ?? PRODUCT_SORTS.revenue;
  const dir = Prisma.raw(opts.dir === 'asc' ? 'ASC' : 'DESC');
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);

  /**
   * Orders are joined with the date and sale conditions IN the join, and
   * items are then only counted where that join found an order. Putting the
   * conditions in WHERE instead would drop every product with no sales from
   * the table entirely - the ones most worth seeing.
   */
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT p."id", p."name", p."slug", p."sizeLabel", p."imagePath", p."isActive",
           p."pricePaise", p."stockCount", p."lowStockThreshold",
           COALESCE(SUM(i."quantity") FILTER (WHERE o."id" IS NOT NULL), 0)::int AS units,
           COALESCE(SUM(i."quantity" * i."unitPricePaise") FILTER (WHERE o."id" IS NOT NULL), 0)::float8 AS revenue,
           COUNT(DISTINCT o."id")::int AS orders
    FROM products p
    LEFT JOIN order_items i ON i."productId" = p."id"
    LEFT JOIN orders o
           ON o."id" = i."orderId"
          AND o."placedAt" >= ${start} AND o."placedAt" < ${end}
          AND ${SALE}
    GROUP BY p."id"
    ORDER BY ${sortCol} ${dir} NULLS LAST, p."name" ASC
    LIMIT ${limit}
  `;

  return rows.map((r) => {
    const stock = r.stockCount == null ? null : n(r.stockCount);
    const threshold = n(r.lowStockThreshold);
    return {
      id: String(r.id),
      name: String(r.name),
      slug: String(r.slug),
      sizeLabel: (r.sizeLabel as string | null) ?? null,
      imagePath: (r.imagePath as string | null) ?? null,
      isActive: Boolean(r.isActive),
      pricePaise: n(r.pricePaise),
      stockCount: stock,
      lowStockThreshold: threshold,
      units: n(r.units),
      revenue: n(r.revenue),
      orders: n(r.orders),
      state: stockState(stock, threshold),
    };
  });
}

// ============================================================ orders

export const ORDERS_PAGE_SIZE = 20;

export async function listOrders(opts: {
  start: Date;
  end: Date;
  status?: string;
  payment?: string;
  q?: string;
  page?: number;
}) {
  const page = Math.max(1, opts.page ?? 1);
  const q = opts.q?.trim().slice(0, 100);

  /**
   * A search ignores the date range. The range is right for browsing, but
   * someone typing an order number is looking for one specific order and
   * should find it whenever it was placed.
   */
  const where: Prisma.OrderWhereInput = {
    ...(q
      ? {
          OR: [
            { orderNumber: { contains: q, mode: 'insensitive' } },
            { contactName: { contains: q, mode: 'insensitive' } },
            { contactEmail: { contains: q, mode: 'insensitive' } },
            { contactPhone: { contains: q } },
          ],
        }
      : { placedAt: { gte: opts.start, lt: opts.end } }),
    ...(opts.status ? { status: opts.status as never } : {}),
    ...(opts.payment ? { paymentStatus: opts.payment as never } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { placedAt: 'desc' },
      skip: (page - 1) * ORDERS_PAGE_SIZE,
      take: ORDERS_PAGE_SIZE,
      select: {
        id: true,
        orderNumber: true,
        contactName: true,
        contactEmail: true,
        totalPaise: true,
        status: true,
        paymentStatus: true,
        placedAt: true,
        _count: { select: { items: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return { rows, total, page, pages: Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE)) };
}

export async function recentOrders(limit = 12) {
  return prisma.order.findMany({
    orderBy: { placedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      orderNumber: true,
      contactName: true,
      totalPaise: true,
      status: true,
      paymentStatus: true,
      placedAt: true,
    },
  });
}

export async function getOrder(id: string) {
  // A malformed id is not an order; answering null avoids a Postgres cast
  // error on something typed into the address bar.
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return prisma.order.findUnique({
    where: { id },
    include: {
      items: { include: { product: { select: { slug: true, stockCount: true } } } },
      customer: { select: { id: true, email: true, fullName: true, createdAt: true } },
    },
  });
}

// ============================================================ customers

export async function customerCounts(start: Date, end: Date) {
  const w = windows();
  const active = new Date(Date.now() - 30 * 86_400_000);
  const [r] = await prisma.$queryRaw<Record<string, unknown>[]>`
    WITH per AS (
      SELECT c."id", c."createdAt",
             COUNT(o."id") FILTER (WHERE ${SALE}) AS orders
      FROM customers c
      LEFT JOIN orders o ON o."customerId" = c."id"
      GROUP BY c."id"
    )
    SELECT
      COUNT(*)::int                                                AS total,
      COUNT(*) FILTER (WHERE "createdAt" >= ${w.today})::int       AS new_today,
      COUNT(*) FILTER (WHERE "createdAt" >= ${w.week})::int        AS new_week,
      COUNT(*) FILTER (WHERE "createdAt" >= ${w.month})::int       AS new_month,
      COUNT(*) FILTER (WHERE "createdAt" >= ${start} AND "createdAt" < ${end})::int AS new_in_range,
      COUNT(*) FILTER (WHERE orders >= 1)::int                     AS with_orders,
      COUNT(*) FILTER (WHERE orders = 0)::int                      AS without_orders,
      COUNT(*) FILTER (WHERE orders >= 2)::int                     AS returning
    FROM per
  `;

  // Active = seen on the site OR ordered in the last 30 days.
  const [a] = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT COUNT(DISTINCT id)::int AS active FROM (
      SELECT "customerId" AS id FROM page_views WHERE "customerId" IS NOT NULL AND "createdAt" >= ${active}
      UNION
      SELECT "customerId" AS id FROM orders WHERE "customerId" IS NOT NULL AND "placedAt" >= ${active}
    ) x
  `;

  return {
    total: n(r.total),
    newToday: n(r.new_today),
    newWeek: n(r.new_week),
    newMonth: n(r.new_month),
    newInRange: n(r.new_in_range),
    withOrders: n(r.with_orders),
    withoutOrders: n(r.without_orders),
    returning: n(r.returning),
    active: n(a.active),
  };
}

export async function customerGrowth(range: DateRange) {
  const b = bucketExpr(Prisma.sql`c."createdAt"`, range.bucket);
  const rows = await prisma.$queryRaw<{ k: string; v: unknown }[]>`
    SELECT ${b} AS k, COUNT(*)::int AS v
    FROM customers c
    WHERE c."createdAt" >= ${range.start} AND c."createdAt" < ${range.end}
    GROUP BY 1
  `;
  return fill(range, rows);
}

export const CUSTOMER_SORTS = {
  joined: Prisma.raw('c."createdAt"'),
  orders: Prisma.raw('orders'),
  spent: Prisma.raw('spent'),
  last: Prisma.raw('last_order'),
  name: Prisma.raw('c."fullName"'),
} as const;
export type CustomerSort = keyof typeof CUSTOMER_SORTS;
export const CUSTOMERS_PAGE_SIZE = 20;

export async function listCustomers(opts: {
  q?: string;
  sort?: CustomerSort;
  dir?: 'asc' | 'desc';
  filter?: 'all' | 'buyers' | 'never';
  page?: number;
}) {
  const page = Math.max(1, opts.page ?? 1);
  const sortCol = CUSTOMER_SORTS[opts.sort ?? 'joined'] ?? CUSTOMER_SORTS.joined;
  const dir = Prisma.raw(opts.dir === 'asc' ? 'ASC' : 'DESC');
  const q = (opts.q ?? '').trim().slice(0, 100);
  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

  const search = q
    ? Prisma.sql`AND (c."email" ILIKE ${like} OR c."fullName" ILIKE ${like} OR c."phone" ILIKE ${like})`
    : Prisma.empty;

  const having =
    opts.filter === 'buyers'
      ? Prisma.sql`HAVING COUNT(o."id") FILTER (WHERE ${SALE}) >= 1`
      : opts.filter === 'never'
        ? Prisma.sql`HAVING COUNT(o."id") FILTER (WHERE ${SALE}) = 0`
        : Prisma.empty;

  const base = Prisma.sql`
    FROM customers c
    LEFT JOIN orders o ON o."customerId" = c."id"
    WHERE TRUE ${search}
    GROUP BY c."id"
    ${having}
  `;

  const [rows, [t]] = await Promise.all([
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT c."id", c."fullName", c."email", c."phone", c."createdAt",
             COUNT(o."id") FILTER (WHERE ${SALE})::int                    AS orders,
             COALESCE(SUM(${NET}) FILTER (WHERE ${SALE}), 0)::float8       AS spent,
             MAX(o."placedAt")                                            AS last_order
      ${base}
      ORDER BY ${sortCol} ${dir} NULLS LAST, c."createdAt" DESC
      LIMIT ${CUSTOMERS_PAGE_SIZE} OFFSET ${(page - 1) * CUSTOMERS_PAGE_SIZE}
    `,
    prisma.$queryRaw<{ c: unknown }[]>`SELECT COUNT(*)::int AS c FROM (SELECT c."id" ${base}) x`,
  ]);

  const total = n(t.c);
  return {
    rows: rows.map((r) => ({
      id: String(r.id),
      name: (r.fullName as string | null) ?? null,
      email: (r.email as string | null) ?? null,
      phone: (r.phone as string | null) ?? null,
      joined: r.createdAt as Date,
      orders: n(r.orders),
      spent: n(r.spent),
      lastOrder: (r.last_order as Date | null) ?? null,
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / CUSTOMERS_PAGE_SIZE)),
  };
}

// ============================================================ visitors

export async function visitorTotals(start: Date, end: Date) {
  const [r] = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT
      COUNT(*)::int                       AS views,
      COUNT(DISTINCT "sessionId")::int    AS visits,
      COUNT(DISTINCT "visitorId")::int    AS uniques,
      COUNT(DISTINCT "customerId")::int   AS registered
    FROM page_views
    WHERE "createdAt" >= ${start} AND "createdAt" < ${end}
  `;

  /**
   * Returning = in this range AND seen at least once before it began. Backed
   * by the (visitorId, createdAt) index, so the EXISTS is a lookup, not a
   * scan.
   */
  const [ret] = await prisma.$queryRaw<{ c: unknown }[]>`
    SELECT COUNT(DISTINCT v."visitorId")::int AS c
    FROM page_views v
    WHERE v."createdAt" >= ${start} AND v."createdAt" < ${end}
      AND EXISTS (
        SELECT 1 FROM page_views p
        WHERE p."visitorId" = v."visitorId" AND p."createdAt" < ${start}
      )
  `;

  const uniques = n(r.uniques);
  const returning = n(ret.c);
  return {
    views: n(r.views),
    visits: n(r.visits),
    uniques,
    registered: n(r.registered),
    returning,
    newVisitors: Math.max(0, uniques - returning),
  };
}

export async function visitorWindows() {
  const w = windows();
  const yesterday = new Date(w.today.getTime() - 86_400_000);
  const d7 = new Date(w.tomorrow.getTime() - 7 * 86_400_000);
  const d30 = new Date(w.tomorrow.getTime() - 30 * 86_400_000);
  const [r] = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT
      COUNT(DISTINCT "visitorId") FILTER (WHERE "createdAt" >= ${w.today})::int AS today,
      COUNT(DISTINCT "visitorId") FILTER (WHERE "createdAt" >= ${yesterday} AND "createdAt" < ${w.today})::int AS yesterday,
      COUNT(DISTINCT "visitorId") FILTER (WHERE "createdAt" >= ${d7})::int  AS d7,
      COUNT(DISTINCT "visitorId") FILTER (WHERE "createdAt" >= ${d30})::int AS d30,
      COUNT(DISTINCT "visitorId")::int AS total
    FROM page_views
  `;
  return {
    today: n(r.today),
    yesterday: n(r.yesterday),
    d7: n(r.d7),
    d30: n(r.d30),
    total: n(r.total),
  };
}

export async function visitorSeries(range: DateRange) {
  const b = bucketExpr(Prisma.sql`v."createdAt"`, range.bucket);
  const rows = await prisma.$queryRaw<{ k: string; v: unknown; v2: unknown }[]>`
    SELECT ${b} AS k,
           COUNT(DISTINCT v."visitorId")::int AS v,
           COUNT(DISTINCT v."sessionId")::int AS v2
    FROM page_views v
    WHERE v."createdAt" >= ${range.start} AND v."createdAt" < ${range.end}
    GROUP BY 1
  `;
  return fill(range, rows);
}

export async function visitorBreakdown(start: Date, end: Date) {
  const [devices, pages, referrers] = await Promise.all([
    prisma.$queryRaw<{ k: string; c: unknown }[]>`
      SELECT "device" AS k, COUNT(DISTINCT "visitorId")::int AS c
      FROM page_views WHERE "createdAt" >= ${start} AND "createdAt" < ${end}
      GROUP BY 1 ORDER BY 2 DESC
    `,
    prisma.$queryRaw<{ k: string; c: unknown }[]>`
      SELECT "path" AS k, COUNT(*)::int AS c
      FROM page_views WHERE "createdAt" >= ${start} AND "createdAt" < ${end}
      GROUP BY 1 ORDER BY 2 DESC LIMIT 8
    `,
    prisma.$queryRaw<{ k: string; c: unknown }[]>`
      SELECT COALESCE("referrerHost", 'Direct') AS k, COUNT(DISTINCT "sessionId")::int AS c
      FROM page_views WHERE "createdAt" >= ${start} AND "createdAt" < ${end}
      GROUP BY 1 ORDER BY 2 DESC LIMIT 8
    `,
  ]);
  const map = (rows: { k: string; c: unknown }[]) => rows.map((r) => ({ label: r.k, count: n(r.c) }));
  return { devices: map(devices), pages: map(pages), referrers: map(referrers) };
}
