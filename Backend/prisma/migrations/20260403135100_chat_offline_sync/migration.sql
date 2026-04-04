-- CreateEnum
CREATE TYPE "ChatSyncEventType" AS ENUM ('MESSAGE_CREATED', 'MESSAGE_UPDATED', 'MESSAGE_DELETED', 'REACTION_ADDED', 'REACTION_REMOVED', 'POLL_VOTED', 'MESSAGE_TRANSCRIPTION_UPDATED');

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ConversationSyncState" (
    "contextType" "ChatContextType" NOT NULL,
    "contextId" TEXT NOT NULL,
    "maxSeq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ConversationSyncState_pkey" PRIMARY KEY ("contextType","contextId")
);

-- CreateTable
CREATE TABLE "ChatSyncEvent" (
    "id" TEXT NOT NULL,
    "contextType" "ChatContextType" NOT NULL,
    "contextId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "eventType" "ChatSyncEventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatSyncEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConversationSyncState_contextId_idx" ON "ConversationSyncState"("contextId");

-- CreateIndex
CREATE INDEX "ChatSyncEvent_contextType_contextId_seq_idx" ON "ChatSyncEvent"("contextType", "contextId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "ChatSyncEvent_contextType_contextId_seq_key" ON "ChatSyncEvent"("contextType", "contextId", "seq");

-- CreateIndex
CREATE INDEX "ChatMessage_deletedAt_idx" ON "ChatMessage"("deletedAt");
