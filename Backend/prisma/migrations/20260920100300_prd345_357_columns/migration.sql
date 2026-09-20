-- AlterTable
ALTER TABLE "Game" ADD COLUMN "seriesId" TEXT,
ADD COLUMN "seriesOccurrenceDate" DATE,
ADD COLUMN "autoFillFromQueue" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "showOnLiveRail" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "lastSeatOpenedAt" TIMESTAMP(3),
ADD COLUMN "costPayerId" TEXT,
ADD COLUMN "paymentHint" VARCHAR(120),
ADD COLUMN "costFrozenAt" TIMESTAMP(3),
ADD COLUMN "weatherAlertState" JSONB;

-- AlterTable
ALTER TABLE "GameParticipant" ADD COLUMN "attendance" "ParticipantAttendance" NOT NULL DEFAULT 'UNANSWERED',
ADD COLUMN "attendanceUpdatedAt" TIMESTAMP(3),
ADD COLUMN "noShowNotedById" TEXT,
ADD COLUMN "noShowNotedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3),
ADD COLUMN "onboardingStep" TEXT,
ADD COLUMN "referralCode" TEXT,
ADD COLUMN "referredByUserId" TEXT;

-- AlterTable
ALTER TABLE "UserSportProfile" ADD COLUMN "attendedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "noShowCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN "sendWeatherAlerts" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
-- `kind` and `assetKey` are required in the Prisma schema but are added nullable here: `Goods` is a
-- non-empty table in every environment and a NOT NULL column without a default would fail. The
-- following migration backfills every row and then applies SET NOT NULL.
ALTER TABLE "Goods" ADD COLUMN "kind" "GoodsKind",
ADD COLUMN "assetKey" TEXT,
ADD COLUMN "previewUrl" TEXT,
ADD COLUMN "description" VARCHAR(400),
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "isFeatured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "premiumOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "LinkToAppAttribution" ADD COLUMN "referrerUserId" TEXT;

-- CreateIndex
-- Both columns are nullable and PostgreSQL treats NULLs as distinct, so every existing
-- non-series game stays unaffected by this unique constraint.
CREATE UNIQUE INDEX "Game_seriesId_seriesOccurrenceDate_key" ON "Game"("seriesId", "seriesOccurrenceDate");

-- CreateIndex
CREATE INDEX "Game_seriesId_idx" ON "Game"("seriesId");

-- CreateIndex
CREATE INDEX "Game_costPayerId_idx" ON "Game"("costPayerId");

-- CreateIndex
CREATE INDEX "Game_lastSeatOpenedAt_idx" ON "Game"("lastSeatOpenedAt");

-- CreateIndex
CREATE INDEX "Game_resultsStatus_isPublic_showOnLiveRail_idx" ON "Game"("resultsStatus", "isPublic", "showOnLiveRail");

-- CreateIndex
CREATE INDEX "GameParticipant_noShowNotedById_idx" ON "GameParticipant"("noShowNotedById");

-- CreateIndex
CREATE INDEX "GameParticipant_gameId_attendance_idx" ON "GameParticipant"("gameId", "attendance");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- CreateIndex
CREATE INDEX "User_referredByUserId_idx" ON "User"("referredByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Goods_kind_assetKey_key" ON "Goods"("kind", "assetKey");

-- CreateIndex
CREATE INDEX "Goods_kind_isActive_sortOrder_idx" ON "Goods"("kind", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "Goods_isActive_isFeatured_idx" ON "Goods"("isActive", "isFeatured");

-- CreateIndex
CREATE INDEX "LinkToAppAttribution_referrerUserId_idx" ON "LinkToAppAttribution"("referrerUserId");

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "GameSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_costPayerId_fkey" FOREIGN KEY ("costPayerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameParticipant" ADD CONSTRAINT "GameParticipant_noShowNotedById_fkey" FOREIGN KEY ("noShowNotedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredByUserId_fkey" FOREIGN KEY ("referredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkToAppAttribution" ADD CONSTRAINT "LinkToAppAttribution_referrerUserId_fkey" FOREIGN KEY ("referrerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
