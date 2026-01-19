-- CreateTable
CREATE TABLE "ChatDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chatContextType" "ChatContextType" NOT NULL,
    "contextId" TEXT NOT NULL,
    "chatType" "ChatType" NOT NULL DEFAULT 'PUBLIC',
    "content" TEXT,
    "mentionIds" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatDraft_userId_idx" ON "ChatDraft"("userId");

-- CreateIndex
CREATE INDEX "ChatDraft_chatContextType_contextId_idx" ON "ChatDraft"("chatContextType", "contextId");

-- CreateIndex
CREATE INDEX "ChatDraft_updatedAt_idx" ON "ChatDraft"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatDraft_userId_chatContextType_contextId_chatType_key" ON "ChatDraft"("userId", "chatContextType", "contextId", "chatType");

-- AddForeignKey
ALTER TABLE "ChatDraft" ADD CONSTRAINT "ChatDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
