-- Client-executed agent actions (docs/plans/ai-agent-booking.md §14.5, slice 7f)

-- AlterTable
ALTER TABLE "AgentPendingAction" ADD COLUMN     "attemptId" VARCHAR(64),
ADD COLUMN     "claimKey" VARCHAR(128),
ADD COLUMN     "leaseExpiresAt" TIMESTAMP(3),
ADD COLUMN     "reportedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AgentRun" ADD COLUMN     "clientCaps" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "AgentPendingAction_status_leaseExpiresAt_idx" ON "AgentPendingAction"("status", "leaseExpiresAt");
