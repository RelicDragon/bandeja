-- CreateEnum
CREATE TYPE "SportLevelSource" AS ENUM ('DEFAULT', 'QUESTIONNAIRE', 'MANUAL');

-- AlterTable
ALTER TABLE "UserSportProfile" ADD COLUMN     "questionnaireCompletedAt" TIMESTAMP(3),
ADD COLUMN     "questionnaireSkippedAt" TIMESTAMP(3),
ADD COLUMN     "questionnaireVersion" TEXT,
ADD COLUMN     "levelSource" "SportLevelSource" NOT NULL DEFAULT 'DEFAULT';

-- AlterTable
ALTER TABLE "LevelChangeEvent" ADD COLUMN     "sport" "Sport";

-- CreateIndex
CREATE INDEX "LevelChangeEvent_sport_idx" ON "LevelChangeEvent"("sport");

-- Backfill competitive history sport from linked games
UPDATE "LevelChangeEvent" AS lce
SET "sport" = g."sport"
FROM "Game" AS g
WHERE lce."gameId" = g."id"
  AND lce."sport" IS NULL
  AND lce."eventType" IN ('GAME', 'SET');

-- Legacy padel-only questionnaire rows (no game)
UPDATE "LevelChangeEvent"
SET "sport" = 'PADEL'
WHERE "sport" IS NULL
  AND "eventType" = 'QUESTIONNAIRE';

-- Legacy LUNDA import (pre-multisport competitive level on User.level)
UPDATE "LevelChangeEvent"
SET "sport" = 'PADEL'
WHERE "sport" IS NULL
  AND "eventType" = 'LUNDA';
