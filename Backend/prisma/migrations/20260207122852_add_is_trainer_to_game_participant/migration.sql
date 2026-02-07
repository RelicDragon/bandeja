-- AlterTable
ALTER TABLE "GameParticipant" ADD COLUMN     "isTrainer" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "GroupChannel_bugId_idx" ON "GroupChannel"("bugId");
