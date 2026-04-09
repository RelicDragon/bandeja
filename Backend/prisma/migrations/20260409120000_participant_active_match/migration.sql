-- AlterTable
ALTER TABLE "GameParticipant" ADD COLUMN "activeMatchId" TEXT;

-- CreateIndex
CREATE INDEX "GameParticipant_activeMatchId_idx" ON "GameParticipant"("activeMatchId");

-- AddForeignKey
ALTER TABLE "GameParticipant" ADD CONSTRAINT "GameParticipant_activeMatchId_fkey" FOREIGN KEY ("activeMatchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;
