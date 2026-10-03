-- Real deposit payments through Razorpay.
--
-- The deposit page used to mark a deposit PAID without charging anything.
-- It now opens Razorpay Checkout, and a membership activates only once the
-- gateway's signed confirmation arrives. These two columns tie that
-- confirmation back to the membership.

ALTER TABLE "memberships"
  ADD COLUMN "depositGatewayOrderId" TEXT,
  ADD COLUMN "depositPaymentId"      TEXT;

CREATE UNIQUE INDEX "memberships_depositGatewayOrderId_key"
  ON "memberships"("depositGatewayOrderId");
