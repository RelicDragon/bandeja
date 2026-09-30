ALTER TABLE "GroupChannel" ADD COLUMN "leagueGroupId" TEXT;

CREATE UNIQUE INDEX "GroupChannel_leagueGroupId_key" ON "GroupChannel"("leagueGroupId");

ALTER TABLE "GroupChannel" ADD CONSTRAINT "GroupChannel_leagueGroupId_fkey" FOREIGN KEY ("leagueGroupId") REFERENCES "LeagueGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
