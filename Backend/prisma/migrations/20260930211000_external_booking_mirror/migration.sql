-- CreateEnum
CREATE TYPE "ExternalBookingMirrorState" AS ENUM ('CONFIRMED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ExternalBookingMirror" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "ClubIntegrationType" NOT NULL,
    "clubId" TEXT NOT NULL,
    "externalBookingId" TEXT NOT NULL,
    "courts" JSONB NOT NULL DEFAULT '[]',
    "bookingStart" TIMESTAMP(3) NOT NULL,
    "bookingEnd" TIMESTAMP(3) NOT NULL,
    "state" "ExternalBookingMirrorState" NOT NULL DEFAULT 'CONFIRMED',
    "syncedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "ExternalBookingMirror_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalBookingMirrorSync" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "ClubIntegrationType" NOT NULL,
    "clubId" TEXT NOT NULL,
    "rangeFrom" TIMESTAMP(3) NOT NULL,
    "rangeTo" TIMESTAMP(3) NOT NULL,
    "complete" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "ExternalBookingMirrorSync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExternalBookingMirror_userId_bookingStart_idx" ON "ExternalBookingMirror"("userId", "bookingStart");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalBookingMirror_userId_provider_externalBookingId_key" ON "ExternalBookingMirror"("userId", "provider", "externalBookingId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalBookingMirrorSync_userId_provider_clubId_key" ON "ExternalBookingMirrorSync"("userId", "provider", "clubId");

-- AddForeignKey
ALTER TABLE "ExternalBookingMirror" ADD CONSTRAINT "ExternalBookingMirror_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalBookingMirror" ADD CONSTRAINT "ExternalBookingMirror_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalBookingMirrorSync" ADD CONSTRAINT "ExternalBookingMirrorSync_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalBookingMirrorSync" ADD CONSTRAINT "ExternalBookingMirrorSync_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
