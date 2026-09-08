-- A short reference the customer can quote back, e.g. ZGC-260908-A7K2.
--
-- Nullable because rows already existed before this column did. Every new
-- enquiry gets one; the unique index still stops two people ever sharing a
-- reference.
ALTER TABLE "leads" ADD COLUMN "reference" TEXT;

CREATE UNIQUE INDEX "leads_reference_key" ON "leads"("reference");
