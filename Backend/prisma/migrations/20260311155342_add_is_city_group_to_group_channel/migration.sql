-- AlterTable
ALTER TABLE "GroupChannel" ADD COLUMN     "isCityGroup" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "GroupChannel_isCityGroup_idx" ON "GroupChannel"("isCityGroup");
