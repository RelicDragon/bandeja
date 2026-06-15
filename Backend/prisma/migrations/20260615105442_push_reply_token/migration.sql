-- CreateTable
CREATE TABLE "PushReplyToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "chatContextType" "ChatContextType" NOT NULL,
    "contextId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "chatType" "ChatType",
    "clientMutationId" TEXT,
    "resultMessageId" TEXT,
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushReplyToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushReplyToken_tokenHash_key" ON "PushReplyToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PushReplyToken_recipientUserId_idx" ON "PushReplyToken"("recipientUserId");

-- CreateIndex
CREATE INDEX "PushReplyToken_expiresAt_idx" ON "PushReplyToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "PushReplyToken" ADD CONSTRAINT "PushReplyToken_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
