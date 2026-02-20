-- AlterTable
ALTER TABLE "LlmUsageLog" ADD COLUMN     "reason" VARCHAR(64),
ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE INDEX "LlmUsageLog_userId_idx" ON "LlmUsageLog"("userId");

-- CreateIndex
CREATE INDEX "LlmUsageLog_reason_idx" ON "LlmUsageLog"("reason");
