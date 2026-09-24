-- Close the database to the public API key.
--
-- Supabase exposes every table in `public` over PostgREST, and the anon key
-- that authorises it ships in the browser on every page load - it is public by
-- design. Row Level Security is the only thing that stands between that key
-- and the data, and it was off on all thirteen tables with no policies.
--
-- Measured before this migration, using nothing but the key from the page
-- source: customers, orders, order_items, leads, page_views, email_throttle,
-- products and cows were all readable, and PATCH on orders, customers and
-- products was accepted rather than refused. That is every customer's name,
-- email, phone and delivery address readable by anyone, and prices and order
-- records writable by anyone.
--
-- Enabling RLS with no policies denies anon and authenticated everything.
-- Nothing is granted back, because nothing needs it: the browser's Supabase
-- client is used only for auth, and every read and write the site performs
-- goes through Prisma, which connects as `postgres` - a role with
-- rolbypassrls = true, so it is unaffected by any of this.
--
-- If a table ever does need to be read straight from the browser, the answer
-- is a policy on that table for that case, not turning this back off.

ALTER TABLE "public"."customers"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."addresses"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."orders"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."order_items"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."memberships"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."leads"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."products"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."reviews"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."cows"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."health_reports"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."page_views"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."email_throttle"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
