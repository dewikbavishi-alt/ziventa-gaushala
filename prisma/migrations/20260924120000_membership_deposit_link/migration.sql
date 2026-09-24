-- The emailed deposit link.
--
-- A seat is approved in the admin, which mails the family a link to pay the
-- refundable deposit. The link needs something unguessable to identify the
-- membership by, and it must stop working once the money is in - otherwise a
-- forwarded email could be replayed to pay twice, or to flip a settled
-- membership back open.
--
-- Nullable because every existing row predates the column, and unique so two
-- memberships can never share a link.
ALTER TABLE "public"."memberships" ADD COLUMN "depositToken"   TEXT;
ALTER TABLE "public"."memberships" ADD COLUMN "depositTokenAt" TIMESTAMP(3);
ALTER TABLE "public"."memberships" ADD COLUMN "depositPaidAt"  TIMESTAMP(3);

CREATE UNIQUE INDEX "memberships_depositToken_key"
  ON "public"."memberships"("depositToken");
