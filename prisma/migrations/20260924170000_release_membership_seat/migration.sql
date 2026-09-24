-- Let a family leave the Gir Gold Club and give their seat back to the 250.
--
-- Until now seatNumber was NOT NULL, so a membership held its seat forever.
-- Marking a family as LEFT did nothing to free it: approveMembership looks for
-- the lowest unused number across every membership row, so the club would
-- quietly shrink below 250 with every departure and the last seats could never
-- be filled.
--
-- Making the column nullable is what fixes that. Postgres allows any number of
-- NULLs in a unique index, so releasing a seat is simply setting it to NULL -
-- the number becomes available to the next family while the departed family's
-- record stays exactly where it is.
ALTER TABLE "memberships" ALTER COLUMN "seatNumber" DROP NOT NULL;

-- Which seat they held, kept when the seat is released. Their history should
-- not evaporate because they left, and if they come back we can tell them
-- which seat was theirs.
ALTER TABLE "memberships" ADD COLUMN "formerSeatNumber" INTEGER;

-- memberships_seat_number_range, from 20260907112315_integrity_constraints,
-- still holds: NULL BETWEEN 1 AND 250 evaluates to NULL, and a CHECK accepts
-- anything that is not false. So a released seat passes it and an out-of-range
-- seat is still refused. The same rule is applied to the new column.
ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_former_seat_number_range"
  CHECK ("formerSeatNumber" IS NULL OR "formerSeatNumber" BETWEEN 1 AND 250);

-- A membership cannot hold a seat and be recorded as having left it.
--
-- This is the rule the whole feature rests on, so it is enforced here rather
-- than trusted to the action that writes it: if LEFT ever stopped clearing the
-- seat, the club would start shrinking again, silently, and the only symptom
-- would be seats that can never be filled.
ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_left_holds_no_seat"
  CHECK ("status" <> 'LEFT' OR "seatNumber" IS NULL);
