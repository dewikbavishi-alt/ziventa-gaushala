-- Room for a real payment gateway.
--
-- paymentReference already existed and was null on every row; it now has a
-- defined meaning and a paymentId beside it.
--
--   paymentReference  the gateway's ORDER id (Razorpay order_xxx). Created
--                     before the customer pays, never changed afterwards,
--                     and what an incoming webhook is matched on.
--   paymentId         the gateway's PAYMENT id (pay_xxx). Exists only once
--                     money has moved, and is what a refund is issued
--                     against.
--
-- Two columns rather than reusing one, because overwriting the order id at
-- capture would break webhook matching for every message that arrives after
-- it - and Razorpay retries webhooks.
ALTER TABLE "orders" ADD COLUMN "paymentId" TEXT;

-- One gateway order may belong to at most one of ours.
--
-- Without this, a bug that reused a gateway order id across two of our orders
-- would let a single payment mark both as paid: the webhook matches on this
-- column, and a second matching row is a second thing marked sold. Postgres
-- permits any number of NULLs in a unique index, so the many orders that
-- never reach a gateway - cash on delivery, and every order placed before
-- today - are unaffected.
CREATE UNIQUE INDEX "orders_paymentReference_key" ON "orders"("paymentReference");

-- Looking an order up by its payment id happens on every refund and every
-- support question that starts with a Razorpay dashboard screenshot.
CREATE INDEX "orders_paymentId_idx" ON "orders"("paymentId");
