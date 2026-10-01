-- AlterTable
ALTER TABLE "AgentChat" ADD COLUMN     "summary" TEXT,
ADD COLUMN     "summaryTainted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "summaryThroughSeq" INTEGER,
ADD COLUMN     "summaryUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "agentMemoryConsolidatedAt" TIMESTAMP(3);
