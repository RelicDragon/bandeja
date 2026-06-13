/*
  Warnings:

  - You are about to drop the column `externalBookingId` on the `Game` table. All the data in the column will be lost.
  - You are about to drop the column `externalBookingProvider` on the `Game` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Game_externalBookingId_idx";

-- AlterTable
ALTER TABLE "Game" DROP COLUMN "externalBookingId",
DROP COLUMN "externalBookingProvider",
ADD COLUMN     "timeOverride" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "GameExternalBooking" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "externalBookingId" TEXT NOT NULL,
    "externalBookingProvider" "ClubIntegrationType" NOT NULL DEFAULT 'BOOKTIME',
    "courtId" TEXT,
    "bookingStart" TIMESTAMP(3),
    "bookingEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameExternalBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameExternalBooking_externalBookingId_idx" ON "GameExternalBooking"("externalBookingId");

-- CreateIndex
CREATE INDEX "GameExternalBooking_gameId_idx" ON "GameExternalBooking"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "GameExternalBooking_gameId_externalBookingId_key" ON "GameExternalBooking"("gameId", "externalBookingId");

-- AddForeignKey
ALTER TABLE "GameExternalBooking" ADD CONSTRAINT "GameExternalBooking_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameExternalBooking" ADD CONSTRAINT "GameExternalBooking_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE SET NULL ON UPDATE CASCADE;
