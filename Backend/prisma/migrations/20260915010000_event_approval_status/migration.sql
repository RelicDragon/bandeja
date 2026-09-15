-- CreateEnum
CREATE TYPE "EventApprovalStatus" AS ENUM ('ON_APPROVE', 'APPROVED', 'DECLINED');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN "eventApprovalStatus" "EventApprovalStatus";

-- CreateIndex
CREATE INDEX "Game_eventApprovalStatus_idx" ON "Game"("eventApprovalStatus");

UPDATE "Game" SET "eventApprovalStatus" = 'ON_APPROVE' WHERE "entityType" = 'EVENT' AND "eventApprovalStatus" IS NULL;
