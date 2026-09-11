-- Readable rupee columns, sitting directly on the tables.
--
-- The views added earlier work, but they are a separate thing to go and open.
-- These appear right next to the paise columns in the Supabase table editor,
-- so money is legible wherever you happen to be looking.
--
-- GENERATED ALWAYS ... STORED means Postgres computes and keeps them in step
-- automatically. They cannot be written to and cannot drift out of sync with
-- the paise value they come from - there is no code path that could update one
-- and forget the other.
--
-- Storage stays integer paise on purpose: the pricing logic, the CHECK
-- constraint guaranteeing total = subtotal + shipping, and Razorpay later all
-- work in paise. Nothing about how money is calculated changes here.

ALTER TABLE "orders"
  ADD COLUMN "subtotal_rupees" numeric(12,2)
    GENERATED ALWAYS AS (("subtotalPaise"::numeric) / 100) STORED,
  ADD COLUMN "delivery_rupees" numeric(12,2)
    GENERATED ALWAYS AS (("shippingPaise"::numeric) / 100) STORED,
  ADD COLUMN "total_rupees" numeric(12,2)
    GENERATED ALWAYS AS (("totalPaise"::numeric) / 100) STORED;

ALTER TABLE "order_items"
  ADD COLUMN "unit_price_rupees" numeric(12,2)
    GENERATED ALWAYS AS (("unitPricePaise"::numeric) / 100) STORED,
  ADD COLUMN "line_total_rupees" numeric(12,2)
    GENERATED ALWAYS AS ((("unitPricePaise" * "quantity")::numeric) / 100) STORED;

ALTER TABLE "products"
  ADD COLUMN "price_rupees" numeric(12,2)
    GENERATED ALWAYS AS (("pricePaise"::numeric) / 100) STORED;

ALTER TABLE "memberships"
  ADD COLUMN "deposit_rupees" numeric(12,2)
    GENERATED ALWAYS AS (("depositPaise"::numeric) / 100) STORED;

COMMENT ON COLUMN "orders"."total_rupees" IS
  'Read-only. Calculated by Postgres from totalPaise; cannot be edited directly.';
COMMENT ON COLUMN "products"."price_rupees" IS
  'Read-only. Edit pricePaise to change the price.';
