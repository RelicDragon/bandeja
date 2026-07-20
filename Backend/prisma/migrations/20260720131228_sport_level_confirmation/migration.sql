-- AlterTable
ALTER TABLE "UserSportProfile" ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "approvedLevel" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "approvedWhen" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "UserSportProfile_approvedById_idx" ON "UserSportProfile"("approvedById");

-- AddForeignKey
ALTER TABLE "UserSportProfile" ADD CONSTRAINT "UserSportProfile_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ADR-008: copy legacy User.approved* onto PADEL sport profiles (source of truth).
UPDATE "UserSportProfile" AS usp
SET
  "approvedLevel" = u."approvedLevel",
  "approvedById" = u."approvedById",
  "approvedWhen" = u."approvedWhen"
FROM "User" AS u
WHERE usp."userId" = u.id
  AND usp.sport = 'PADEL'
  AND u."approvedLevel" = true;

-- Create missing PADEL profiles for users who were confirmed but had no profile row.
INSERT INTO "UserSportProfile" (
  id,
  "userId",
  sport,
  level,
  reliability,
  "ratingUncertainty",
  "gamesPlayed",
  "gamesWon",
  "playStreakCount",
  "playStreakBest",
  "levelSource",
  "approvedLevel",
  "approvedById",
  "approvedWhen",
  "createdAt",
  "updatedAt"
)
SELECT
  concat('usp_', replace(gen_random_uuid()::text, '-', '')),
  u.id,
  'PADEL',
  1.0,
  0,
  0,
  0,
  0,
  0,
  0,
  'DEFAULT',
  true,
  u."approvedById",
  u."approvedWhen",
  NOW(),
  NOW()
FROM "User" AS u
WHERE u."approvedLevel" = true
  AND NOT EXISTS (
    SELECT 1
    FROM "UserSportProfile" AS usp
    WHERE usp."userId" = u.id
      AND usp.sport = 'PADEL'
  );
