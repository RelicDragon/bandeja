-- AlterTable
ALTER TABLE "AgentRun" ADD COLUMN     "cachedInputTokens" INTEGER,
ADD COLUMN     "endReason" VARCHAR(32);

-- AlterTable
ALTER TABLE "LlmUsageLog" ADD COLUMN     "cachedInputTokens" INTEGER;
