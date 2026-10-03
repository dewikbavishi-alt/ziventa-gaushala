-- Close the readable views to the public API key.
--
-- 20260924090000 enabled Row Level Security on every table, but RLS applies
-- to tables, not views. A view runs with its OWNER's rights by default, and
-- the owner here is `postgres`, which bypasses RLS. Supabase had also granted
-- SELECT on these views to `anon` the moment they were created, as it does
-- for everything in `public`.
--
-- Measured before this migration, with nothing but the anon key from the page
-- source: orders_readable returned every order (9) - name, email, phone and
-- full delivery address - order_items_readable every line (9), and
-- products_readable both products. The `orders` table itself correctly
-- returned 0. The views were made for browsing in the Supabase table editor,
-- which signs in as `postgres` and is unaffected by any of this.
--
-- Three layers, so no single one has to hold:
--
--  1. REVOKE: anon and authenticated lose all access to the views - and, for
--     good measure, to every table, since RLS already denies them everything
--     and nothing in the site reads the database through Supabase's API. The
--     site goes through Prisma as `postgres`, which keeps full access.
--
--  2. security_invoker: the views now check the rights of whoever is asking,
--     not of their owner, so even a future accidental GRANT would hit the
--     tables' RLS and return nothing.
--
--  3. Default privileges: tables, views and sequences created from now on are
--     NOT granted to anon and authenticated automatically. That automatic
--     grant is exactly how these three views were exposed; without it, a new
--     table has to be opened on purpose.

-- 1. Take the access away.
REVOKE ALL ON "public"."orders_readable"      FROM anon, authenticated;
REVOKE ALL ON "public"."order_items_readable" FROM anon, authenticated;
REVOKE ALL ON "public"."products_readable"    FROM anon, authenticated;

REVOKE ALL ON ALL TABLES    IN SCHEMA "public" FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA "public" FROM anon, authenticated;

-- 2. Make the views obey the caller's rights and the tables' RLS.
ALTER VIEW "public"."orders_readable"      SET (security_invoker = true);
ALTER VIEW "public"."order_items_readable" SET (security_invoker = true);
ALTER VIEW "public"."products_readable"    SET (security_invoker = true);

-- 3. Stop new objects being opened to the public key automatically.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA "public"
  REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA "public"
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
