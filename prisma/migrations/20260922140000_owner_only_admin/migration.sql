-- The admin dashboard belongs to one owner, named in ADMIN_EMAILS.
--
-- The role column added earlier today made it possible to grant admin to any
-- customer - from a "make admin" button, a script, or simply by editing this
-- column in the Supabase table editor. That is a second way in, and the
-- requirement is that there is only one. So it goes.
--
-- Safe to drop: it was added in 20260922100000_admin_dashboard and every row
-- still holds the default 'USER', so no access is lost.

ALTER TABLE "customers" DROP COLUMN "role";
DROP TYPE "Role";
