-- Integrity rules Prisma's schema language cannot express.
--
-- These live in the database on purpose. Application-level validation can be
-- bypassed by a bad migration, a dashboard edit, a background job or a second
-- service; a CHECK constraint cannot.

-- The Gir Gold Club is capped at 250 founding families. Combined with the
-- existing UNIQUE index on seatNumber, this makes a 251st member impossible -
-- including under two concurrent signups, which an application-level
-- "SELECT count(*) then INSERT" check would let through.
ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_seat_number_range"
  CHECK ("seatNumber" BETWEEN 1 AND 250);

-- A refundable deposit cannot be negative.
ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_deposit_non_negative"
  CHECK ("depositPaise" >= 0);

-- Money is stored in integer paise. A product must cost something.
ALTER TABLE "products"
  ADD CONSTRAINT "products_price_positive"
  CHECK ("pricePaise" > 0);

ALTER TABLE "products"
  ADD CONSTRAINT "products_stock_non_negative"
  CHECK ("stockCount" IS NULL OR "stockCount" >= 0);

-- You cannot order zero or a negative number of jars.
ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_quantity_positive"
  CHECK ("quantity" > 0);

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_price_non_negative"
  CHECK ("unitPricePaise" >= 0);

-- Order money must be internally consistent. This is the constraint that stops
-- a bug in pricing code from silently writing an order whose total does not
-- match its own subtotal and shipping.
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_amounts_non_negative"
  CHECK ("subtotalPaise" >= 0 AND "shippingPaise" >= 0 AND "totalPaise" >= 0);

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_total_is_subtotal_plus_shipping"
  CHECK ("totalPaise" = "subtotalPaise" + "shippingPaise");

-- Star ratings are 1 to 5.
ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_rating_range"
  CHECK ("rating" BETWEEN 1 AND 5);

-- Health reports must carry a summary worth reading.
ALTER TABLE "health_reports"
  ADD CONSTRAINT "health_reports_summary_not_blank"
  CHECK (length(btrim("summary")) > 0);
