-- CreateTable
CREATE TABLE "LeagueTeamRosterAlias" (
    "id" TEXT NOT NULL,
    "leagueSeasonId" TEXT NOT NULL,
    "leagueTeamId" TEXT NOT NULL,
    "rosterKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeagueTeamRosterAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeagueTeamRosterAlias_leagueTeamId_idx" ON "LeagueTeamRosterAlias"("leagueTeamId");

-- CreateIndex
CREATE INDEX "LeagueTeamRosterAlias_leagueSeasonId_idx" ON "LeagueTeamRosterAlias"("leagueSeasonId");

-- CreateIndex
CREATE UNIQUE INDEX "LeagueTeamRosterAlias_leagueSeasonId_rosterKey_key" ON "LeagueTeamRosterAlias"("leagueSeasonId", "rosterKey");

-- AddForeignKey
ALTER TABLE "LeagueTeamRosterAlias" ADD CONSTRAINT "LeagueTeamRosterAlias_leagueSeasonId_fkey" FOREIGN KEY ("leagueSeasonId") REFERENCES "LeagueSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueTeamRosterAlias" ADD CONSTRAINT "LeagueTeamRosterAlias_leagueTeamId_fkey" FOREIGN KEY ("leagueTeamId") REFERENCES "LeagueTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
