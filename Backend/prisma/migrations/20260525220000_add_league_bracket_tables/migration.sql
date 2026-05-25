-- CreateEnum
CREATE TYPE "PlayoffFormat" AS ENUM ('SESSION', 'BRACKET');

-- CreateEnum
CREATE TYPE "BracketSlotKind" AS ENUM ('PLAY_IN', 'BYE', 'MAIN', 'THIRD_PLACE', 'CONSOLATION', 'LOSERS', 'GRAND_FINAL');

-- CreateEnum
CREATE TYPE "BracketScope" AS ENUM ('PER_GROUP', 'CROSS_GROUP');

-- AlterTable
ALTER TABLE "LeagueRound" ADD COLUMN     "playoffFormat" "PlayoffFormat",
ADD COLUMN     "bracketScope" "BracketScope" NOT NULL DEFAULT 'PER_GROUP',
ADD COLUMN     "entrantCount" INTEGER,
ADD COLUMN     "bracketSize" INTEGER,
ADD COLUMN     "byeCount" INTEGER,
ADD COLUMN     "bracketTemplateVersion" INTEGER,
ADD COLUMN     "bracketConfig" JSONB;

-- CreateTable
CREATE TABLE "LeagueBracketSlot" (
    "id" TEXT NOT NULL,
    "leagueRoundId" TEXT NOT NULL,
    "leagueGroupId" TEXT,
    "slotKey" TEXT NOT NULL,
    "slotKind" "BracketSlotKind" NOT NULL,
    "phaseIndex" INTEGER NOT NULL,
    "roundIndex" INTEGER NOT NULL,
    "matchIndex" INTEGER NOT NULL,
    "leagueParticipantId" TEXT,
    "gameId" TEXT,
    "winnerSlotId" TEXT,
    "feederSlotAId" TEXT,
    "feederSlotBId" TEXT,
    "seedRank" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeagueBracketSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeagueBracketSlot_gameId_key" ON "LeagueBracketSlot"("gameId");

-- CreateIndex
CREATE INDEX "LeagueBracketSlot_leagueRoundId_idx" ON "LeagueBracketSlot"("leagueRoundId");

-- CreateIndex
CREATE INDEX "LeagueBracketSlot_leagueGroupId_idx" ON "LeagueBracketSlot"("leagueGroupId");

-- CreateIndex
CREATE INDEX "LeagueBracketSlot_gameId_idx" ON "LeagueBracketSlot"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "LeagueBracketSlot_leagueRoundId_leagueGroupId_slotKey_key" ON "LeagueBracketSlot"("leagueRoundId", "leagueGroupId", "slotKey");

-- AddForeignKey
ALTER TABLE "LeagueBracketSlot" ADD CONSTRAINT "LeagueBracketSlot_leagueRoundId_fkey" FOREIGN KEY ("leagueRoundId") REFERENCES "LeagueRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueBracketSlot" ADD CONSTRAINT "LeagueBracketSlot_leagueGroupId_fkey" FOREIGN KEY ("leagueGroupId") REFERENCES "LeagueGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueBracketSlot" ADD CONSTRAINT "LeagueBracketSlot_leagueParticipantId_fkey" FOREIGN KEY ("leagueParticipantId") REFERENCES "LeagueParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueBracketSlot" ADD CONSTRAINT "LeagueBracketSlot_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueBracketSlot" ADD CONSTRAINT "LeagueBracketSlot_winnerSlotId_fkey" FOREIGN KEY ("winnerSlotId") REFERENCES "LeagueBracketSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueBracketSlot" ADD CONSTRAINT "LeagueBracketSlot_feederSlotAId_fkey" FOREIGN KEY ("feederSlotAId") REFERENCES "LeagueBracketSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueBracketSlot" ADD CONSTRAINT "LeagueBracketSlot_feederSlotBId_fkey" FOREIGN KEY ("feederSlotBId") REFERENCES "LeagueBracketSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
