-- AlterEnum
ALTER TYPE "ScoringPreset" ADD VALUE 'CLASSIC_SINGLE_SET';

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "matchTimerEnabled" BOOLEAN NOT NULL DEFAULT false;
