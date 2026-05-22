-- AlterTable (IF NOT EXISTS: safe when column was synced via db push in dev)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "primarySportIsSet" BOOLEAN NOT NULL DEFAULT false;

-- Existing users already play padel (sportsEnabled defaults); skip the onboarding sport modal.
UPDATE "User" SET "primarySportIsSet" = true;
