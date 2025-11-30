-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "leagueGroupId" TEXT;

-- CreateIndex
CREATE INDEX "Game_leagueGroupId_idx" ON "Game"("leagueGroupId");

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_leagueGroupId_fkey" FOREIGN KEY ("leagueGroupId") REFERENCES "LeagueGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
