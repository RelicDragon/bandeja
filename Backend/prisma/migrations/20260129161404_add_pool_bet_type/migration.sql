-- CreateEnum
CREATE TYPE "BetPoolSide" AS ENUM ('WITH_CREATOR', 'AGAINST_CREATOR');

-- AlterEnum
ALTER TYPE "BetType" ADD VALUE 'POOL';

-- AlterTable
ALTER TABLE "Bet" ADD COLUMN     "poolTotalCoins" INTEGER;

-- CreateTable
CREATE TABLE "BetParticipant" (
    "id" TEXT NOT NULL,
    "betId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "side" "BetPoolSide" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BetParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BetParticipant_betId_idx" ON "BetParticipant"("betId");

-- CreateIndex
CREATE INDEX "BetParticipant_userId_idx" ON "BetParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BetParticipant_betId_userId_key" ON "BetParticipant"("betId", "userId");

-- AddForeignKey
ALTER TABLE "BetParticipant" ADD CONSTRAINT "BetParticipant_betId_fkey" FOREIGN KEY ("betId") REFERENCES "Bet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BetParticipant" ADD CONSTRAINT "BetParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
