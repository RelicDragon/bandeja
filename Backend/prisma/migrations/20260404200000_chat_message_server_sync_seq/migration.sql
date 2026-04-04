-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN "serverSyncSeq" INTEGER;

CREATE INDEX "ChatMessage_chatContextType_contextId_serverSyncSeq_idx" ON "ChatMessage"("chatContextType", "contextId", "serverSyncSeq");
