-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "courtId" TEXT;

-- CreateIndex
CREATE INDEX "Match_courtId_idx" ON "Match"("courtId");

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE SET NULL ON UPDATE CASCADE;
