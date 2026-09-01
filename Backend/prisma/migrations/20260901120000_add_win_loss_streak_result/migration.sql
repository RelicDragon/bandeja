-- Keep event-winner semantics intact while storing the separate profile streak result.
-- Nullable supports zero-downtime deployment: old backend processes can continue to
-- insert outcomes until the new backend is running and the audited backfill is applied.
ALTER TABLE "GameOutcome" ADD COLUMN "isWinForStreak" BOOLEAN;
