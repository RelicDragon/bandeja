-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "externalBookingId" TEXT,
ADD COLUMN     "externalBookingProvider" "ClubIntegrationType";

-- CreateIndex
CREATE INDEX "Game_externalBookingId_idx" ON "Game"("externalBookingId");
