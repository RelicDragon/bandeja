ALTER TABLE "UserAchievementStats"
ADD COLUMN "tieBreakSetWins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "tiebreakRefreshedAt" TIMESTAMP(3),
ADD COLUMN "tiebreakRepairFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "tiebreakRepairFailedAt" TIMESTAMP(3);
