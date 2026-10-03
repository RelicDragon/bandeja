-- CreateEnum
CREATE TYPE "AgentMessageFeedback" AS ENUM ('UP', 'DOWN');

-- AlterTable
ALTER TABLE "AgentMessage" ADD COLUMN     "feedback" "AgentMessageFeedback",
ADD COLUMN     "feedbackAt" TIMESTAMP(3),
ADD COLUMN     "feedbackComment" VARCHAR(500);

-- CreateIndex
CREATE INDEX "AgentMessage_feedback_feedbackAt_idx" ON "AgentMessage"("feedback", "feedbackAt");

-- CreateIndex
CREATE INDEX "LlmUsageLog_userId_createdAt_idx" ON "LlmUsageLog"("userId", "createdAt");
