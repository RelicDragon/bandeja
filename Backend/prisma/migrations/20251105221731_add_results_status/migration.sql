-- CreateEnum
CREATE TYPE "ResultsStatus" AS ENUM ('NONE', 'IN_PROGRESS', 'FINAL');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "resultsStatus" "ResultsStatus" NOT NULL DEFAULT 'NONE';

-- CreateIndex
CREATE INDEX "Game_resultsStatus_idx" ON "Game"("resultsStatus");
