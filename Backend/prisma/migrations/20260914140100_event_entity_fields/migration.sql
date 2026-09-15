-- CreateEnum
CREATE TYPE "EventKind" AS ENUM ('TOURNAMENT', 'LEAGUE', 'CAMP');

-- CreateEnum
CREATE TYPE "EventPriceNote" AS ENUM ('PER_PERSON', 'PER_PAIR', 'FROM');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN "eventKind" "EventKind",
ADD COLUMN "venueText" TEXT,
ADD COLUMN "externalUrl" TEXT,
ADD COLUMN "priceNote" "EventPriceNote";

-- AlterTable
ALTER TABLE "GameParticipant" ADD COLUMN "lookingForPartner" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "lookingNote" TEXT;

-- CreateTable
CREATE TABLE "GameEventHero" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameEventHero_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Game_eventKind_idx" ON "Game"("eventKind");

-- CreateIndex
CREATE INDEX "GameEventHero_gameId_sortOrder_idx" ON "GameEventHero"("gameId", "sortOrder");

-- AddForeignKey
ALTER TABLE "GameEventHero" ADD CONSTRAINT "GameEventHero_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
