-- Reserve stock when an order is placed; release it if the order is cancelled
-- or returned.
--
-- Until now products.stockCount was only ever written by hand in the admin
-- inventory screen. Orders never touched it, so the figures on that screen
-- were decoration and two families could buy the same last jar.
--
-- Both columns are NULL for every order that already exists, which is
-- deliberate: those orders were placed before anything was reserved, so
-- cancelling one must not hand back units it never took.
-- Nothing here needs to guard stockCount against going negative:
-- products_stock_non_negative, added in 20260907112315_integrity_constraints,
-- already does. The reservation is written as a conditional UPDATE that
-- Postgres evaluates while holding the row lock, so a race cannot drive the
-- count under zero in the first place - and if a later change ever gets that
-- arithmetic wrong, that constraint fails the transaction loudly instead of
-- quietly overselling.
ALTER TABLE "orders" ADD COLUMN "stockReservedAt" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "stockReleasedAt" TIMESTAMP(3);
