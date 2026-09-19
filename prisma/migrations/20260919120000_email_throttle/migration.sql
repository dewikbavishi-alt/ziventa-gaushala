-- Rate limiting for the sign-in email endpoint.
--
-- That endpoint mails any address it is handed, which is what it is for. The
-- limit is what stops it also being a way to send Ziventa-branded email to
-- strangers on our mail server and our domain's reputation.
--
-- In the database rather than in memory because serverless instances do not
-- share memory - an in-process counter guards one instance while the next
-- request starts fresh somewhere else.

CREATE TABLE "email_throttle" (
    "id"     UUID         NOT NULL DEFAULT gen_random_uuid(),
    "email"  TEXT         NOT NULL,
    "kind"   TEXT         NOT NULL DEFAULT 'auth_link',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_throttle_pkey" PRIMARY KEY ("id")
);

-- Serves the "how many in the last N minutes" question directly.
CREATE INDEX "email_throttle_email_kind_sentAt_idx"
    ON "email_throttle" ("email", "kind", "sentAt");

-- Serves cleanup of old rows.
CREATE INDEX "email_throttle_sentAt_idx"
    ON "email_throttle" ("sentAt");
