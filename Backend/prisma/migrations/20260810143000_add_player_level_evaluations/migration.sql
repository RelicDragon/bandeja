-- CreateEnum
CREATE TYPE "PlayerLevelVerdict" AS ENUM ('LOWER', 'ABOUT_RIGHT', 'HIGHER');

-- CreateTable
CREATE TABLE "PlayerLevelEvaluation" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "sport" "Sport" NOT NULL,
    "evaluatorUserId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "verdict" "PlayerLevelVerdict" NOT NULL,
    "levelSnapshot" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerLevelEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerLevelEvaluation_gameId_evaluatorUserId_targetUserId_key"
ON "PlayerLevelEvaluation"("gameId", "evaluatorUserId", "targetUserId");

-- CreateIndex
CREATE INDEX "PlayerLevelEvaluation_targetUserId_sport_createdAt_idx"
ON "PlayerLevelEvaluation"("targetUserId", "sport", "createdAt");

-- CreateIndex
CREATE INDEX "PlayerLevelEvaluation_evaluatorUserId_createdAt_idx"
ON "PlayerLevelEvaluation"("evaluatorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "PlayerLevelEvaluation_gameId_idx"
ON "PlayerLevelEvaluation"("gameId");

-- AddForeignKey
ALTER TABLE "PlayerLevelEvaluation"
ADD CONSTRAINT "PlayerLevelEvaluation_gameId_fkey"
FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerLevelEvaluation"
ADD CONSTRAINT "PlayerLevelEvaluation_evaluatorUserId_fkey"
FOREIGN KEY ("evaluatorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerLevelEvaluation"
ADD CONSTRAINT "PlayerLevelEvaluation_targetUserId_fkey"
FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
