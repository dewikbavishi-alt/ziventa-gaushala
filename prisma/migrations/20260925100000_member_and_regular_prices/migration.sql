-- Two prices per product: what anyone pays, and what a member pays.
--
-- The landing page has always carried a Member/Regular toggle promising
-- "member Rs 3,150-3,200/kg, regular Rs 4,000/kg - you save 20%". The shop
-- charged every visitor the MEMBER price, so a guest got the discount for
-- free and a Rs 5,000 refundable deposit bought no price advantage at all,
-- while the page claimed it bought 20%.
--
-- pricePaise becomes the REGULAR price and memberPricePaise is added beside
-- it. That direction is the point: code that reads a price without thinking
-- about membership now charges full price, which is a billing question to
-- sort out. Had pricePaise kept the member price, the same slip would hand
-- the discount to every guest - silently, and in the customer's favour, so
-- nobody would ever report it.

-- Nullable first, so the existing rows can be filled before the column is
-- made required. An ADD COLUMN NOT NULL with no default would fail outright,
-- and one with a default would quietly invent a price.
ALTER TABLE "products" ADD COLUMN "memberPricePaise" INTEGER;

-- Every current pricePaise IS the member price - that is what the shop has
-- been charging - so it moves across unchanged. No member's price changes.
UPDATE "products" SET "memberPricePaise" = "pricePaise";

-- The regular prices. Ghee comes straight off the Rs 4,000/kg the pricing
-- card already advertises, which lands on round numbers:
--
--   250g  Rs 800  member -> Rs 1,000 regular   (Rs 3,200/kg vs 4,000, -20.0%)
--   500g  Rs 1,600        -> Rs 2,000          (Rs 3,200/kg vs 4,000, -20.0%)
--   1kg   Rs 3,150        -> Rs 4,000          (Rs 3,150/kg vs 4,000, -21.3%)
--
-- The Panchgavya range was never given a regular rate on the page, so it
-- takes the same roughly-20% gap, rounded to the nearest Rs 10 for prices a
-- person can read:
--
--   Dhoop     Rs 250       -> Rs 310           (-19.4%)
--   Ark       Rs 350       -> Rs 440           (-20.5%)
--   Gift Box  Rs 4,200     -> Rs 5,250         (-20.0%)
UPDATE "products" SET "pricePaise" = 100000 WHERE "slug" = 'ghee-250';
UPDATE "products" SET "pricePaise" = 200000 WHERE "slug" = 'ghee-500';
UPDATE "products" SET "pricePaise" = 400000 WHERE "slug" = 'ghee-1kg';
UPDATE "products" SET "pricePaise" =  31000 WHERE "slug" = 'dhoop';
UPDATE "products" SET "pricePaise" =  44000 WHERE "slug" = 'ark';
UPDATE "products" SET "pricePaise" = 525000 WHERE "slug" = 'gift';

-- Any product added since this file was written, or seeded differently, keeps
-- a single price rather than being given an invented discount.
UPDATE "products" SET "pricePaise" = "memberPricePaise" WHERE "pricePaise" < "memberPricePaise";

ALTER TABLE "products" ALTER COLUMN "memberPricePaise" SET NOT NULL;

-- The read-only rupee view, matching price_rupees on the column beside it.
ALTER TABLE "products"
  ADD COLUMN "member_price_rupees" NUMERIC(12,2)
  GENERATED ALWAYS AS (("memberPricePaise")::numeric / (100)::numeric) STORED;

-- A member may never be quoted more than a guest.
--
-- In the database because this is the one rule the whole feature rests on. A
-- typo in an admin form that inverted the pair would otherwise charge members
-- MORE than strangers for the privilege of having paid a deposit, and the
-- shop would render it without complaint.
ALTER TABLE "products"
  ADD CONSTRAINT "products_member_price_not_above_regular"
  CHECK ("memberPricePaise" > 0 AND "memberPricePaise" <= "pricePaise");
