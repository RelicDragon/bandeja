-- AlterTable
ALTER TABLE "GameExternalBooking" ADD COLUMN     "bookedByUserId" TEXT;

-- CreateIndex
CREATE INDEX "GameExternalBooking_bookedByUserId_idx" ON "GameExternalBooking"("bookedByUserId");

-- AddForeignKey
ALTER TABLE "GameExternalBooking" ADD CONSTRAINT "GameExternalBooking_bookedByUserId_fkey" FOREIGN KEY ("bookedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
