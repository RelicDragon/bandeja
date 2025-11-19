-- CreateEnum
CREATE TYPE "LeagueParticipantType" AS ENUM ('USER', 'TEAM');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "leagueRoundId" TEXT;

-- CreateTable
CREATE TABLE "League" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "hasFixedTeams" BOOLEAN NOT NULL DEFAULT false,
    "cityId" TEXT,
    "clubId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "League_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueSeason" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3),
    "minLevel" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "maxLevel" DOUBLE PRECISION NOT NULL DEFAULT 7.0,
    "maxParticipants" INTEGER NOT NULL DEFAULT 4,
    "gameSetupSeasonId" TEXT,
    "gameSetupPlayoffId" TEXT,
    "movePlayersRule" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeagueSeason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueGroup" (
    "id" TEXT NOT NULL,
    "leagueSeasonId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "betterGroupId" TEXT,
    "worseGroupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeagueGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueTeam" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeagueTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueTeamPlayer" (
    "id" TEXT NOT NULL,
    "leagueTeamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeagueTeamPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueParticipant" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "leagueSeasonId" TEXT NOT NULL,
    "participantType" "LeagueParticipantType" NOT NULL,
    "userId" TEXT,
    "leagueTeamId" TEXT,
    "currentGroupId" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "ties" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "scoreDelta" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeagueParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueRound" (
    "id" TEXT NOT NULL,
    "leagueSeasonId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeagueRound_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "League_cityId_idx" ON "League"("cityId");

-- CreateIndex
CREATE INDEX "League_clubId_idx" ON "League"("clubId");

-- CreateIndex
CREATE INDEX "LeagueSeason_leagueId_idx" ON "LeagueSeason"("leagueId");

-- CreateIndex
CREATE INDEX "LeagueSeason_orderIndex_idx" ON "LeagueSeason"("orderIndex");

-- CreateIndex
CREATE INDEX "LeagueGroup_leagueSeasonId_idx" ON "LeagueGroup"("leagueSeasonId");

-- CreateIndex
CREATE INDEX "LeagueTeam_id_idx" ON "LeagueTeam"("id");

-- CreateIndex
CREATE INDEX "LeagueTeamPlayer_leagueTeamId_idx" ON "LeagueTeamPlayer"("leagueTeamId");

-- CreateIndex
CREATE INDEX "LeagueTeamPlayer_userId_idx" ON "LeagueTeamPlayer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LeagueTeamPlayer_leagueTeamId_userId_key" ON "LeagueTeamPlayer"("leagueTeamId", "userId");

-- CreateIndex
CREATE INDEX "LeagueParticipant_leagueId_idx" ON "LeagueParticipant"("leagueId");

-- CreateIndex
CREATE INDEX "LeagueParticipant_leagueSeasonId_idx" ON "LeagueParticipant"("leagueSeasonId");

-- CreateIndex
CREATE INDEX "LeagueParticipant_userId_idx" ON "LeagueParticipant"("userId");

-- CreateIndex
CREATE INDEX "LeagueParticipant_leagueTeamId_idx" ON "LeagueParticipant"("leagueTeamId");

-- CreateIndex
CREATE INDEX "LeagueParticipant_currentGroupId_idx" ON "LeagueParticipant"("currentGroupId");

-- CreateIndex
CREATE INDEX "LeagueParticipant_participantType_idx" ON "LeagueParticipant"("participantType");

-- CreateIndex
CREATE INDEX "LeagueRound_leagueSeasonId_idx" ON "LeagueRound"("leagueSeasonId");

-- CreateIndex
CREATE INDEX "LeagueRound_orderIndex_idx" ON "LeagueRound"("orderIndex");

-- CreateIndex
CREATE INDEX "Game_leagueRoundId_idx" ON "Game"("leagueRoundId");

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_leagueRoundId_fkey" FOREIGN KEY ("leagueRoundId") REFERENCES "LeagueRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "League" ADD CONSTRAINT "League_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "League" ADD CONSTRAINT "League_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueSeason" ADD CONSTRAINT "LeagueSeason_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueSeason" ADD CONSTRAINT "LeagueSeason_gameSetupSeasonId_fkey" FOREIGN KEY ("gameSetupSeasonId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueSeason" ADD CONSTRAINT "LeagueSeason_gameSetupPlayoffId_fkey" FOREIGN KEY ("gameSetupPlayoffId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueGroup" ADD CONSTRAINT "LeagueGroup_leagueSeasonId_fkey" FOREIGN KEY ("leagueSeasonId") REFERENCES "LeagueSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueGroup" ADD CONSTRAINT "LeagueGroup_betterGroupId_fkey" FOREIGN KEY ("betterGroupId") REFERENCES "LeagueGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueGroup" ADD CONSTRAINT "LeagueGroup_worseGroupId_fkey" FOREIGN KEY ("worseGroupId") REFERENCES "LeagueGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueTeamPlayer" ADD CONSTRAINT "LeagueTeamPlayer_leagueTeamId_fkey" FOREIGN KEY ("leagueTeamId") REFERENCES "LeagueTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueTeamPlayer" ADD CONSTRAINT "LeagueTeamPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueParticipant" ADD CONSTRAINT "LeagueParticipant_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueParticipant" ADD CONSTRAINT "LeagueParticipant_leagueSeasonId_fkey" FOREIGN KEY ("leagueSeasonId") REFERENCES "LeagueSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueParticipant" ADD CONSTRAINT "LeagueParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueParticipant" ADD CONSTRAINT "LeagueParticipant_leagueTeamId_fkey" FOREIGN KEY ("leagueTeamId") REFERENCES "LeagueTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueParticipant" ADD CONSTRAINT "LeagueParticipant_currentGroupId_fkey" FOREIGN KEY ("currentGroupId") REFERENCES "LeagueGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueRound" ADD CONSTRAINT "LeagueRound_leagueSeasonId_fkey" FOREIGN KEY ("leagueSeasonId") REFERENCES "LeagueSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;
