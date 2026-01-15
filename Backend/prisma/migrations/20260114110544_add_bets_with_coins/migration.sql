-- CreateEnum
CREATE TYPE "BetType" AS ENUM ('SOCIAL');

-- CreateEnum
CREATE TYPE "BetStatus" AS ENUM ('OPEN', 'ACCEPTED', 'RESOLVED', 'CANCELLED', 'NEEDS_REVIEW');

-- CreateTable
CREATE TABLE "Bet" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "type" "BetType" NOT NULL DEFAULT 'SOCIAL',
    "status" "BetStatus" NOT NULL DEFAULT 'OPEN',
    "condition" JSONB NOT NULL,
    "stakeType" TEXT NOT NULL DEFAULT 'COINS',
    "stakeCoins" INTEGER,
    "stakeText" TEXT,
    "rewardType" TEXT NOT NULL DEFAULT 'COINS',
    "rewardCoins" INTEGER,
    "rewardText" TEXT,
    "acceptedBy" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "winnerId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Bet_gameId_idx" ON "Bet"("gameId");

-- CreateIndex
CREATE INDEX "Bet_creatorId_idx" ON "Bet"("creatorId");

-- CreateIndex
CREATE INDEX "Bet_status_idx" ON "Bet"("status");

-- CreateIndex
CREATE INDEX "Bet_gameId_status_idx" ON "Bet"("gameId", "status");

-- CreateIndex
CREATE INDEX "Bet_acceptedBy_idx" ON "Bet"("acceptedBy");

-- AddForeignKey
ALTER TABLE "Bet" ADD CONSTRAINT "Bet_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bet" ADD CONSTRAINT "Bet_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bet" ADD CONSTRAINT "Bet_acceptedBy_fkey" FOREIGN KEY ("acceptedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bet" ADD CONSTRAINT "Bet_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
