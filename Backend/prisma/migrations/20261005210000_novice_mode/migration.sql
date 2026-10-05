-- Novice mode (PRD #358): per-user novice rank + newcomer-flavoured owner pings.
-- Additive: new columns have defaults, the ping table keeps one LOOKING ping per
-- game through the new (gameId, kind, dayKey) unique index.

-- CreateEnum
CREATE TYPE "PlayIntentGameOwnerPingKind" AS ENUM ('LOOKING', 'NEWCOMER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "noviceCountedGames" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "noviceDebutGameId" TEXT,
ADD COLUMN     "noviceDebutHostUserId" TEXT,
ADD COLUMN     "noviceMilestoneSeenRank" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "noviceRank" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "noviceUnlockedAllAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PlayIntentGameOwnerPing" ADD COLUMN     "dayKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "kind" "PlayIntentGameOwnerPingKind" NOT NULL DEFAULT 'LOOKING';

-- CreateIndex
CREATE INDEX "User_noviceDebutHostUserId_idx" ON "User"("noviceDebutHostUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayIntentGameOwnerPing_gameId_kind_dayKey_key" ON "PlayIntentGameOwnerPing"("gameId", "kind", "dayKey");

-- DropIndex
DROP INDEX "PlayIntentGameOwnerPing_gameId_key";

-- Backfill: counted games for every user. Same rule as
-- Backend/src/services/novice/noviceProgress.service.ts (countedGamesWhere):
-- PLAYING in a FINISHED/ARCHIVED game (never EVENT / LEAGUE_SEASON) with either
-- a GameOutcome row for the user, or a TRAINING/BAR game without a no-show note.
WITH counted AS (
  SELECT gp."userId", COUNT(DISTINCT gp."gameId")::int AS n
  FROM "GameParticipant" gp
  JOIN "Game" g ON g."id" = gp."gameId"
  WHERE gp."status" = 'PLAYING'
    AND g."status" IN ('FINISHED', 'ARCHIVED')
    AND g."entityType" NOT IN ('EVENT', 'LEAGUE_SEASON')
    AND (
      EXISTS (
        SELECT 1 FROM "GameOutcome" go
        WHERE go."gameId" = gp."gameId" AND go."userId" = gp."userId"
      )
      OR (g."entityType" IN ('TRAINING', 'BAR') AND gp."noShowNotedAt" IS NULL)
    )
  GROUP BY gp."userId"
)
UPDATE "User" u
SET "noviceCountedGames" = c.n,
    "noviceRank" = LEAST(c.n, 5),
    "noviceMilestoneSeenRank" = LEAST(c.n, 5)
FROM counted c
WHERE c."userId" = u."id";

-- Grandfathering: existing users never lose UI. Everybody who exists now gets
-- "unlocked everything", except accounts from the last 30 days that have not
-- played a counted game yet — they enter novice mode.
UPDATE "User"
SET "noviceUnlockedAllAt" = now()
WHERE NOT ("createdAt" >= now() - interval '30 days' AND "noviceCountedGames" = 0);
