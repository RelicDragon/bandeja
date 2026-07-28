-- AlterTable
ALTER TABLE "LeagueParticipant" ADD COLUMN     "withdrawnAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "LeagueParticipant_withdrawnAt_idx" ON "LeagueParticipant"("withdrawnAt");
