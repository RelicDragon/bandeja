-- AlterTable
ALTER TABLE "UserSportProfile" ADD COLUMN     "playStreakBest" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "playStreakCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "playStreakLastPlayAt" TIMESTAMP(3),
ADD COLUMN     "playStreakWeekStartAt" TIMESTAMP(3);
