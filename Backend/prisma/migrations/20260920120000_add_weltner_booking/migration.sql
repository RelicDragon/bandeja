-- CreateEnum
CREATE TYPE "WeltnerBookingState" AS ENUM ('SUBMITTING', 'CONFIRMED', 'REJECTED', 'UNKNOWN');

-- AlterEnum
ALTER TYPE "ClubIntegrationType" ADD VALUE 'WELTNER';

-- CreateTable
CREATE TABLE "UserClubWeltnerAuth" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserClubWeltnerAuth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeltnerBooking" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "bookingStart" TIMESTAMP(3) NOT NULL,
    "bookingEnd" TIMESTAMP(3) NOT NULL,
    "state" "WeltnerBookingState" NOT NULL DEFAULT 'SUBMITTING',
    "upstreamBookingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeltnerBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserClubWeltnerAuth_userId_clubId_key" ON "UserClubWeltnerAuth"("userId", "clubId");

-- CreateIndex
CREATE INDEX "WeltnerBooking_userId_clubId_bookingStart_idx" ON "WeltnerBooking"("userId", "clubId", "bookingStart");

-- CreateIndex
CREATE UNIQUE INDEX "WeltnerBooking_userId_clubId_courtId_date_startTime_duratio_key" ON "WeltnerBooking"("userId", "clubId", "courtId", "date", "startTime", "durationMinutes");

-- AddForeignKey
ALTER TABLE "UserClubWeltnerAuth" ADD CONSTRAINT "UserClubWeltnerAuth_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserClubWeltnerAuth" ADD CONSTRAINT "UserClubWeltnerAuth_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeltnerBooking" ADD CONSTRAINT "WeltnerBooking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeltnerBooking" ADD CONSTRAINT "WeltnerBooking_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeltnerBooking" ADD CONSTRAINT "WeltnerBooking_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE CASCADE ON UPDATE CASCADE;
