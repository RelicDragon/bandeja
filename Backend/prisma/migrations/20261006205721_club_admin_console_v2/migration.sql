-- CreateEnum
CREATE TYPE "ClubChargeSourceKind" AS ENUM ('GAME', 'HOLD', 'MANUAL');

-- CreateEnum
CREATE TYPE "ChargeStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID', 'WAIVED', 'VOID');

-- CreateEnum
CREATE TYPE "ClubPaymentMethod" AS ENUM ('CASH', 'CARD', 'TRANSFER', 'ONLINE', 'OTHER');

-- CreateEnum
CREATE TYPE "ClubActivityAction" AS ENUM ('HOLD_CREATED', 'HOLD_UPDATED', 'HOLD_DELETED', 'GAME_CANCELLED', 'COURT_CLEARED', 'COURT_CREATED', 'COURT_UPDATED', 'COURTS_REORDERED', 'CLUB_UPDATED', 'HOURS_UPDATED', 'PRICING_UPDATED', 'CHARGE_CREATED', 'CHARGE_UPDATED', 'PAYMENT_RECORDED', 'PAYMENT_VOIDED', 'TEAM_ADDED', 'TEAM_REMOVED', 'TEAM_ROLE_CHANGED');

-- AlterTable
ALTER TABLE "CancelledGame" ADD COLUMN     "clubId" TEXT,
ADD COLUMN     "courtId" TEXT;

-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "billableHoldLabels" "CourtSlotHoldLabel"[] DEFAULT ARRAY['WALK_IN', 'PHONE', 'ACADEMY', 'OTHER']::"CourtSlotHoldLabel"[],
ADD COLUMN     "currency" "PriceCurrency" NOT NULL DEFAULT 'EUR';

-- AlterTable
ALTER TABLE "Court" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "CourtSlotHold" ADD COLUMN     "customerName" TEXT,
ADD COLUMN     "customerPhone" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT,
ADD COLUMN     "seriesId" TEXT;

-- CreateTable
CREATE TABLE "ClubWeeklyHours" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "openMinute" INTEGER NOT NULL,
    "closeMinute" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubWeeklyHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubClosure" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "openMinute" INTEGER,
    "closeMinute" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubClosure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubPriceRule" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "courtId" TEXT,
    "label" TEXT,
    "weekdays" INTEGER[],
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "pricePerHourCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubPriceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubCharge" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "sourceKind" "ClubChargeSourceKind" NOT NULL,
    "gameId" TEXT,
    "holdId" TEXT,
    "courtId" TEXT,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "description" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" "PriceCurrency" NOT NULL,
    "status" "ChargeStatus" NOT NULL DEFAULT 'UNPAID',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubPayment" (
    "id" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "method" "ClubPaymentMethod" NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "payerName" TEXT,
    "payerUserId" TEXT,
    "note" TEXT,
    "recordedById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubActivity" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" "ClubActivityAction" NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClubWeeklyHours_clubId_weekday_key" ON "ClubWeeklyHours"("clubId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "ClubClosure_clubId_date_key" ON "ClubClosure"("clubId", "date");

-- CreateIndex
CREATE INDEX "ClubPriceRule_clubId_idx" ON "ClubPriceRule"("clubId");

-- CreateIndex
CREATE INDEX "ClubPriceRule_courtId_idx" ON "ClubPriceRule"("courtId");

-- CreateIndex
CREATE INDEX "ClubCharge_clubId_startTime_idx" ON "ClubCharge"("clubId", "startTime");

-- CreateIndex
CREATE INDEX "ClubCharge_clubId_status_idx" ON "ClubCharge"("clubId", "status");

-- CreateIndex
CREATE INDEX "ClubCharge_gameId_clubId_idx" ON "ClubCharge"("gameId", "clubId");

-- CreateIndex
CREATE INDEX "ClubCharge_holdId_idx" ON "ClubCharge"("holdId");

-- CreateIndex
CREATE INDEX "ClubPayment_chargeId_idx" ON "ClubPayment"("chargeId");

-- CreateIndex
CREATE INDEX "ClubPayment_clubId_paidAt_idx" ON "ClubPayment"("clubId", "paidAt");

-- CreateIndex
CREATE INDEX "ClubActivity_clubId_createdAt_idx" ON "ClubActivity"("clubId", "createdAt");

-- CreateIndex
CREATE INDEX "CancelledGame_clubId_cancelledAt_idx" ON "CancelledGame"("clubId", "cancelledAt");

-- CreateIndex
CREATE INDEX "ClubReview_clubId_createdAt_idx" ON "ClubReview"("clubId", "createdAt");

-- CreateIndex
CREATE INDEX "Court_clubId_sortOrder_idx" ON "Court"("clubId", "sortOrder");

-- CreateIndex
CREATE INDEX "CourtSlotHold_seriesId_startTime_idx" ON "CourtSlotHold"("seriesId", "startTime");

-- AddForeignKey
ALTER TABLE "CourtSlotHold" ADD CONSTRAINT "CourtSlotHold_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubWeeklyHours" ADD CONSTRAINT "ClubWeeklyHours_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubClosure" ADD CONSTRAINT "ClubClosure_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubPriceRule" ADD CONSTRAINT "ClubPriceRule_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubPriceRule" ADD CONSTRAINT "ClubPriceRule_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubCharge" ADD CONSTRAINT "ClubCharge_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubCharge" ADD CONSTRAINT "ClubCharge_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubCharge" ADD CONSTRAINT "ClubCharge_holdId_fkey" FOREIGN KEY ("holdId") REFERENCES "CourtSlotHold"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubCharge" ADD CONSTRAINT "ClubCharge_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubCharge" ADD CONSTRAINT "ClubCharge_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubPayment" ADD CONSTRAINT "ClubPayment_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "ClubCharge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubPayment" ADD CONSTRAINT "ClubPayment_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubPayment" ADD CONSTRAINT "ClubPayment_payerUserId_fkey" FOREIGN KEY ("payerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubPayment" ADD CONSTRAINT "ClubPayment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubPayment" ADD CONSTRAINT "ClubPayment_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubActivity" ADD CONSTRAINT "ClubActivity_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubActivity" ADD CONSTRAINT "ClubActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: console column order follows the old alphabetical order.
UPDATE "Court" AS c
SET "sortOrder" = ranked.rn
FROM (
  SELECT "id", (ROW_NUMBER() OVER (PARTITION BY "clubId" ORDER BY "name", "id") - 1)::int AS rn
  FROM "Court"
) AS ranked
WHERE c."id" = ranked."id";
