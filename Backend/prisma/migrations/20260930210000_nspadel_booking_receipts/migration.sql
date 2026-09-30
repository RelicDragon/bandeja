-- CreateEnum
CREATE TYPE "NspadelBookingState" AS ENUM ('SUBMITTING', 'CONFIRMED', 'REJECTED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "NspadelBooking" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "courtId" TEXT,
    "externalCourtId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "bookingStart" TIMESTAMP(3) NOT NULL,
    "bookingEnd" TIMESTAMP(3) NOT NULL,
    "state" "NspadelBookingState" NOT NULL DEFAULT 'SUBMITTING',
    "idempotencyKey" TEXT NOT NULL,
    "externalBookingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NspadelBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NspadelBooking_idempotencyKey_key" ON "NspadelBooking"("idempotencyKey");

-- CreateIndex
CREATE INDEX "NspadelBooking_userId_clubId_bookingStart_idx" ON "NspadelBooking"("userId", "clubId", "bookingStart");

-- CreateIndex
CREATE INDEX "NspadelBooking_externalBookingId_idx" ON "NspadelBooking"("externalBookingId");

-- AddForeignKey
ALTER TABLE "NspadelBooking" ADD CONSTRAINT "NspadelBooking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NspadelBooking" ADD CONSTRAINT "NspadelBooking_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NspadelBooking" ADD CONSTRAINT "NspadelBooking_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE SET NULL ON UPDATE CASCADE;

