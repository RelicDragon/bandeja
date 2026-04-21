-- CreateEnum
CREATE TYPE "MatchTimerStatus" AS ENUM ('IDLE', 'RUNNING', 'PAUSED', 'STOPPED');

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "timerCapMinutes" INTEGER,
ADD COLUMN     "timerElapsedMs" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "timerExpiryNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "timerPausedAt" TIMESTAMP(3),
ADD COLUMN     "timerStartedAt" TIMESTAMP(3),
ADD COLUMN     "timerStatus" "MatchTimerStatus" NOT NULL DEFAULT 'IDLE',
ADD COLUMN     "timerUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "timerUpdatedBy" TEXT;

-- CreateIndex
CREATE INDEX "Match_timerStatus_idx" ON "Match"("timerStatus");
