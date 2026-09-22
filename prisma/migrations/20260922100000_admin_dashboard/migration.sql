-- Admin dashboard: roles, split order/payment status, revenue breakdown,
-- fulfilment timestamps, low-stock thresholds and first-party visitor data.
--
-- Every existing row survives unchanged in meaning. New money columns default
-- to 0, so every current order still satisfies the new total CHECK.

-- ------------------------------------------------------------------------
-- 0. The view that reads orders.status has to go first.
--
-- Postgres refuses to change a column's type while a view depends on it
-- ("cannot alter type of a column used by a view or rule"), so without this
-- the migration would fail halfway through step 4. It is recreated at the
-- end, with the new columns in it.
-- ------------------------------------------------------------------------
DROP VIEW IF EXISTS orders_readable;

-- ------------------------------------------------------------------------
-- 1. Roles
-- ------------------------------------------------------------------------
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');
ALTER TABLE "customers" ADD COLUMN "role" "Role" NOT NULL DEFAULT 'USER';

-- ------------------------------------------------------------------------
-- 2. Low-stock threshold, per product
-- ------------------------------------------------------------------------
ALTER TABLE "products" ADD COLUMN "lowStockThreshold" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "products"
  ADD CONSTRAINT "products_low_stock_threshold_non_negative"
  CHECK ("lowStockThreshold" >= 0);

-- ------------------------------------------------------------------------
-- 3. Payment status, derived from the OLD combined status BEFORE step 4
--    throws that information away.
-- ------------------------------------------------------------------------
CREATE TYPE "PaymentStatus" AS ENUM (
  'PENDING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'
);

ALTER TABLE "orders"
  ADD COLUMN "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING';

-- Only the three old values that were genuinely about money carry across.
-- A SHIPPED or DELIVERED order is NOT assumed paid: on cash on delivery it
-- may not be, and inventing a payment is worse than leaving it pending.
UPDATE "orders" SET "paymentStatus" = (
  CASE "status"::text
    WHEN 'PAID'     THEN 'PAID'
    WHEN 'FAILED'   THEN 'FAILED'
    WHEN 'REFUNDED' THEN 'REFUNDED'
    ELSE 'PENDING'
  END
)::"PaymentStatus";

-- ------------------------------------------------------------------------
-- 4. Order status becomes fulfilment only.
--
-- Renamed and replaced rather than altered in place: Postgres can add enum
-- values but cannot remove them, and PAID / FAILED / SHIPPED / REFUNDED are
-- all leaving.
-- ------------------------------------------------------------------------
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";

CREATE TYPE "OrderStatus" AS ENUM (
  'PENDING', 'CONFIRMED', 'PROCESSING', 'DISPATCHED',
  'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED'
);

ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "orders" ALTER COLUMN "status" TYPE "OrderStatus" USING (
  CASE "status"::text
    WHEN 'PENDING'   THEN 'PENDING'
    WHEN 'PAID'      THEN 'CONFIRMED'   -- paid, not yet sent
    WHEN 'FAILED'    THEN 'PENDING'     -- payment failed; order itself unresolved
    WHEN 'CANCELLED' THEN 'CANCELLED'
    WHEN 'SHIPPED'   THEN 'DISPATCHED'
    WHEN 'DELIVERED' THEN 'DELIVERED'
    WHEN 'REFUNDED'  THEN 'RETURNED'
  END
)::"OrderStatus";

ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'PENDING';

DROP TYPE "OrderStatus_old";

-- ------------------------------------------------------------------------
-- 5. Revenue breakdown and fulfilment detail
-- ------------------------------------------------------------------------
ALTER TABLE "orders"
  ADD COLUMN "discountPaise"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "taxPaise"       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "refundedPaise"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "cancelReason"   TEXT,
  ADD COLUMN "courier"        TEXT,
  ADD COLUMN "trackingNumber" TEXT,
  ADD COLUMN "confirmedAt"    TIMESTAMP(3),
  ADD COLUMN "dispatchedAt"   TIMESTAMP(3),
  ADD COLUMN "deliveredAt"    TIMESTAMP(3),
  ADD COLUMN "cancelledAt"    TIMESTAMP(3),
  ADD COLUMN "returnedAt"     TIMESTAMP(3);

-- ------------------------------------------------------------------------
-- 6. The total rule.
--
-- The old CHECK was total = subtotal + shipping. Left in place, it would
-- reject the first order with any discount or tax - so it is replaced, not
-- added to. Every existing row has discount = tax = 0, so all still pass.
-- ------------------------------------------------------------------------
ALTER TABLE "orders" DROP CONSTRAINT "orders_total_is_subtotal_plus_shipping";

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_total_matches_parts"
  CHECK ("totalPaise" = "subtotalPaise" - "discountPaise" + "shippingPaise" + "taxPaise");

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_adjustments_non_negative"
  CHECK ("discountPaise" >= 0 AND "taxPaise" >= 0 AND "refundedPaise" >= 0);

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_discount_within_subtotal"
  CHECK ("discountPaise" <= "subtotalPaise");

-- A refund can never exceed what was charged.
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_refund_within_total"
  CHECK ("refundedPaise" <= "totalPaise");

-- ------------------------------------------------------------------------
-- 7. Indexes. Every dashboard figure filters by date before anything else.
-- ------------------------------------------------------------------------
CREATE INDEX "orders_paymentStatus_placedAt_idx" ON "orders" ("paymentStatus", "placedAt");
CREATE INDEX "orders_placedAt_idx" ON "orders" ("placedAt");

-- ------------------------------------------------------------------------
-- 8. First-party visitor data. See PageView in schema.prisma for exactly
--    what is and is not kept.
-- ------------------------------------------------------------------------
CREATE TABLE "page_views" (
    "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
    "visitorId"    UUID         NOT NULL,
    "sessionId"    UUID         NOT NULL,
    "customerId"   UUID,
    "path"         TEXT         NOT NULL,
    "referrerHost" TEXT,
    "device"       TEXT         NOT NULL,
    "browser"      TEXT         NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_views_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "page_views_createdAt_idx"           ON "page_views" ("createdAt");
CREATE INDEX "page_views_visitorId_createdAt_idx" ON "page_views" ("visitorId", "createdAt");
CREATE INDEX "page_views_sessionId_idx"           ON "page_views" ("sessionId");

-- ------------------------------------------------------------------------
-- 9. The readable view, back, now showing both statuses and the breakdown.
-- ------------------------------------------------------------------------
CREATE OR REPLACE VIEW orders_readable AS
SELECT
  o."orderNumber"                                    AS order_number,
  o."status"                                         AS order_status,
  o."paymentStatus"                                  AS payment_status,
  o."contactName"                                    AS customer,
  o."contactEmail"                                   AS email,
  o."contactPhone"                                   AS phone,
  (o."subtotalPaise"::numeric / 100)::numeric(12, 2) AS subtotal_rupees,
  (o."discountPaise"::numeric / 100)::numeric(12, 2) AS discount_rupees,
  (o."shippingPaise"::numeric / 100)::numeric(12, 2) AS delivery_rupees,
  (o."taxPaise"::numeric / 100)::numeric(12, 2)      AS tax_rupees,
  (o."totalPaise"::numeric / 100)::numeric(12, 2)    AS total_rupees,
  (o."refundedPaise"::numeric / 100)::numeric(12, 2) AS refunded_rupees,
  o."courier",
  o."trackingNumber"                                 AS tracking_number,
  o."cancelReason"                                   AS cancel_reason,
  concat_ws(', ', o."shipLine1", nullif(o."shipLine2", ''), o."shipCity", o."shipState", o."shipPostcode") AS address,
  o."placedAt"                                       AS placed_at,
  o."id"                                             AS order_id
FROM orders o;

COMMENT ON VIEW orders_readable IS
  'Orders with money shown in rupees. Read-only; the orders table stores paise.';
