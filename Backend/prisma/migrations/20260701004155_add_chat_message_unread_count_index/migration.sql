-- CreateIndex
CREATE INDEX "idx_ChatMessage_unread_count" ON "ChatMessage"("chatContextType", "contextId", "deletedAt");
