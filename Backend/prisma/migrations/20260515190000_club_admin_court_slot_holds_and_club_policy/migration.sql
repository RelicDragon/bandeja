-- CreateEnum
CREATE TYPE "ClubAdminRole" AS ENUM ('ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "CourtSlotHoldLabel" AS ENUM ('WALK_IN', 'PHONE', 'ACADEMY', 'MAINTENANCE', 'OTHER');

-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "cancellationNoticeHours" INTEGER,
ADD COLUMN     "defaultSlotMinutes" INTEGER,
ADD COLUMN     "policyText" TEXT;

-- CreateTable
CREATE TABLE "ClubAdmin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "role" "ClubAdminRole" NOT NULL DEFAULT 'ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourtSlotHold" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "label" "CourtSlotHoldLabel" NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourtSlotHold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClubAdmin_clubId_idx" ON "ClubAdmin"("clubId");

-- CreateIndex
CREATE INDEX "ClubAdmin_userId_idx" ON "ClubAdmin"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubAdmin_userId_clubId_key" ON "ClubAdmin"("userId", "clubId");

-- CreateIndex
CREATE INDEX "CourtSlotHold_clubId_startTime_endTime_idx" ON "CourtSlotHold"("clubId", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "CourtSlotHold_courtId_startTime_idx" ON "CourtSlotHold"("courtId", "startTime");

-- AddForeignKey
ALTER TABLE "ClubAdmin" ADD CONSTRAINT "ClubAdmin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubAdmin" ADD CONSTRAINT "ClubAdmin_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtSlotHold" ADD CONSTRAINT "CourtSlotHold_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtSlotHold" ADD CONSTRAINT "CourtSlotHold_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtSlotHold" ADD CONSTRAINT "CourtSlotHold_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "ChatAutoTranslateConfig_chatContextType_contextId_chatTypeKey_k" RENAME TO "ChatAutoTranslateConfig_chatContextType_contextId_chatTypeK_key";
