-- Readable views for browsing in the Supabase table editor.
--
-- Money is stored as whole paise, which is correct: decimal arithmetic drifts
-- (0.1 + 0.2 = 0.30000000000000004), and over thousands of orders those
-- fractions become real money. Payment providers work in paise for the same
-- reason.
--
-- These views do not change how anything is stored. They are read-only windows
-- that divide by 100 so a human sees 1850.00 instead of 185000. The app keeps
-- using the underlying tables.

CREATE OR REPLACE VIEW orders_readable AS
SELECT
  o."orderNumber"                                    AS order_number,
  o."status",
  o."contactName"                                    AS customer,
  o."contactEmail"                                   AS email,
  o."contactPhone"                                   AS phone,
  (o."subtotalPaise"::numeric / 100)::numeric(12, 2) AS subtotal_rupees,
  (o."shippingPaise"::numeric / 100)::numeric(12, 2) AS delivery_rupees,
  (o."totalPaise"::numeric / 100)::numeric(12, 2)    AS total_rupees,
  concat_ws(', ', o."shipLine1", nullif(o."shipLine2", ''), o."shipCity", o."shipPostcode") AS address,
  o."placedAt"                                       AS placed_at,
  o."id"                                             AS order_id
FROM orders o;

COMMENT ON VIEW orders_readable IS
  'Orders with money shown in rupees. Read-only; the orders table stores paise.';

CREATE OR REPLACE VIEW order_items_readable AS
SELECT
  o."orderNumber"                                        AS order_number,
  i."productName"                                        AS product,
  i."quantity",
  (i."unitPricePaise"::numeric / 100)::numeric(12, 2)    AS unit_price_rupees,
  ((i."unitPricePaise" * i."quantity")::numeric / 100)::numeric(12, 2) AS line_total_rupees,
  o."placedAt"                                           AS placed_at
FROM order_items i
JOIN orders o ON o."id" = i."orderId";

COMMENT ON VIEW order_items_readable IS
  'Order lines with money shown in rupees. Read-only.';

CREATE OR REPLACE VIEW products_readable AS
SELECT
  p."slug",
  p."name",
  p."sizeLabel"                                  AS size,
  (p."pricePaise"::numeric / 100)::numeric(12, 2) AS price_rupees,
  p."isActive"                                   AS active,
  p."sortOrder"                                  AS sort_order
FROM products p
ORDER BY p."sortOrder";

COMMENT ON VIEW products_readable IS
  'Catalogue with prices shown in rupees. Read-only; edit the products table.';
