-- Record which browser VERSION a page view came from.
--
-- The beacon already reduced the user agent to a family word - chrome,
-- safari, samsung - and threw the rest away, so the dashboard could say what
-- people browse with but not whether any of them is below what the site
-- supports. Those are two different questions and only the second one is
-- actionable: the shop's CSS needs Chrome 84 and the account pages, built
-- with Tailwind v4, need Chrome 111.
--
-- Major version only. It answers the question, and it is deliberately not
-- specific enough to help single out one visitor beside the device, referrer
-- and path already on the row.
--
-- Nullable, with no backfill, because there is nothing to backfill from - the
-- version was never stored. Existing rows stay honestly unknown rather than
-- being given an invented number.
ALTER TABLE "page_views" ADD COLUMN "browserVersion" INTEGER;

-- A plausible major version or nothing. Guards against a malformed user agent
-- writing a year, a build number or a negative into the column and skewing
-- every "oldest browser seen" figure afterwards.
ALTER TABLE "page_views"
  ADD CONSTRAINT "page_views_browser_version_plausible"
  CHECK ("browserVersion" IS NULL OR ("browserVersion" > 0 AND "browserVersion" < 1000));
