-- AlterTable
ALTER TABLE "AgentChat" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "pinnedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "AgentChat_userId_deletedAt_archivedAt_idx" ON "AgentChat"("userId", "deletedAt", "archivedAt");
