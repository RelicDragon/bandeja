-- CreateTable
CREATE TABLE "PinnedMessage" (
    "id" TEXT NOT NULL,
    "chatContextType" "ChatContextType" NOT NULL,
    "contextId" TEXT NOT NULL,
    "chatType" "ChatType" NOT NULL DEFAULT 'PUBLIC',
    "messageId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "pinnedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PinnedMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PinnedMessage_chatContextType_contextId_chatType_idx" ON "PinnedMessage"("chatContextType", "contextId", "chatType");

-- CreateIndex
CREATE INDEX "PinnedMessage_messageId_idx" ON "PinnedMessage"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "PinnedMessage_chatContextType_contextId_chatType_messageId_key" ON "PinnedMessage"("chatContextType", "contextId", "chatType", "messageId");

-- AddForeignKey
ALTER TABLE "PinnedMessage" ADD CONSTRAINT "PinnedMessage_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PinnedMessage" ADD CONSTRAINT "PinnedMessage_pinnedById_fkey" FOREIGN KEY ("pinnedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
