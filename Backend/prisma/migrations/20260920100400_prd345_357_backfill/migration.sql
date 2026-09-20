-- Backfill onboarding (PRD 350).
-- Every account that existed before the /welcome flow counts as onboarded, otherwise
-- ProtectedRoute would bounce the whole user base into onboarding on the next release.
UPDATE "User" SET "onboardingCompletedAt" = "createdAt" WHERE "onboardingCompletedAt" IS NULL;

-- Backfill Goods (PRD 355).
-- The rows that exist today predate the shop catalogue and are not real catalogue items: park them
-- as inactive PROFILE_FRAME entries keyed by their own id (ids are unique, so `(kind, assetKey)`
-- stays unique) and hide them from the shop. An admin curates the real catalogue afterwards.
UPDATE "Goods" SET "kind" = 'PROFILE_FRAME', "assetKey" = "id", "isActive" = false;

-- AlterTable
-- Safe now that every row has a value; this is what makes the columns match the Prisma schema,
-- where `kind` and `assetKey` are required.
ALTER TABLE "Goods" ALTER COLUMN "kind" SET NOT NULL;
ALTER TABLE "Goods" ALTER COLUMN "assetKey" SET NOT NULL;

-- Seed PlatformSetting (PRD 348, 351).
-- `COINS_PER_CURRENCY_UNIT` is deliberately NOT seeded. PRD 348 hides the "settle in coins" option
-- while the key is unset, and the rate is deployment-specific — an admin sets it in Platform
-- Settings. Do not add a default here.
INSERT INTO "PlatformSetting" ("key", "value", "createdAt", "updatedAt")
VALUES
    ('REFERRAL_REWARD_REFERRER', '50', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('REFERRAL_REWARD_REFERRED', '25', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
