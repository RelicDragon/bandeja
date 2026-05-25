-- CreateEnum
CREATE TYPE "GameResultsArtifactJobStatus" AS ENUM ('pending', 'running', 'done', 'failed');

-- CreateEnum
CREATE TYPE "GameResultsArtifactStepStatus" AS ENUM ('pending', 'running', 'done', 'skipped', 'failed');

-- CreateEnum
CREATE TYPE "GamePhotoSource" AS ENUM ('USER', 'AI_GENERATED');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "resultsArtifactsReadyAt" TIMESTAMP(3),
ADD COLUMN     "resultsArtifactsVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "resultsSummaryGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "resultsSummaryText" TEXT;

-- AlterTable
ALTER TABLE "GamePhoto" ADD COLUMN     "source" "GamePhotoSource" NOT NULL DEFAULT 'USER';

-- CreateTable
CREATE TABLE "GameResultsArtifactJob" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "status" "GameResultsArtifactJobStatus" NOT NULL DEFAULT 'pending',
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "generationVersion" INTEGER NOT NULL DEFAULT 1,
    "summaryStatus" "GameResultsArtifactStepStatus" NOT NULL DEFAULT 'pending',
    "summaryError" TEXT,
    "photoStatus" "GameResultsArtifactStepStatus" NOT NULL DEFAULT 'pending',
    "photoError" TEXT,
    "replicatePredictionId" TEXT,
    "userPhotoCountAtEnqueue" INTEGER NOT NULL DEFAULT 0,
    "mainPhotoIdAtEnqueue" TEXT,
    "hadUserPhotosAtEnqueue" BOOLEAN NOT NULL DEFAULT false,
    "languageCode" VARCHAR(10) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameResultsArtifactJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GameResultsArtifactJob_gameId_key" ON "GameResultsArtifactJob"("gameId");

-- CreateIndex
CREATE INDEX "GameResultsArtifactJob_status_runAfter_idx" ON "GameResultsArtifactJob"("status", "runAfter");

-- AddForeignKey
ALTER TABLE "GameResultsArtifactJob" ADD CONSTRAINT "GameResultsArtifactJob_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
