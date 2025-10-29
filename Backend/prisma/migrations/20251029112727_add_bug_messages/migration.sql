-- CreateTable
CREATE TABLE "BugMessageReaction" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BugMessageReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BugMessageReadReceipt" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BugMessageReadReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BugMessage" (
    "id" TEXT NOT NULL,
    "bugId" TEXT NOT NULL,
    "senderId" TEXT,
    "content" TEXT,
    "mediaUrls" TEXT[],
    "thumbnailUrls" TEXT[],
    "state" "MessageState" NOT NULL DEFAULT 'SENT',
    "chatType" "ChatType" NOT NULL DEFAULT 'PUBLIC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "replyToId" TEXT,

    CONSTRAINT "BugMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BugMessageReaction_messageId_idx" ON "BugMessageReaction"("messageId");

-- CreateIndex
CREATE INDEX "BugMessageReaction_userId_idx" ON "BugMessageReaction"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BugMessageReaction_messageId_userId_key" ON "BugMessageReaction"("messageId", "userId");

-- CreateIndex
CREATE INDEX "BugMessageReadReceipt_messageId_idx" ON "BugMessageReadReceipt"("messageId");

-- CreateIndex
CREATE INDEX "BugMessageReadReceipt_userId_idx" ON "BugMessageReadReceipt"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BugMessageReadReceipt_messageId_userId_key" ON "BugMessageReadReceipt"("messageId", "userId");

-- CreateIndex
CREATE INDEX "BugMessage_bugId_idx" ON "BugMessage"("bugId");

-- CreateIndex
CREATE INDEX "BugMessage_senderId_idx" ON "BugMessage"("senderId");

-- CreateIndex
CREATE INDEX "BugMessage_createdAt_idx" ON "BugMessage"("createdAt");

-- CreateIndex
CREATE INDEX "BugMessage_state_idx" ON "BugMessage"("state");

-- CreateIndex
CREATE INDEX "BugMessage_replyToId_idx" ON "BugMessage"("replyToId");

-- CreateIndex
CREATE INDEX "BugMessage_chatType_idx" ON "BugMessage"("chatType");

-- AddForeignKey
ALTER TABLE "BugMessageReaction" ADD CONSTRAINT "BugMessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "BugMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugMessageReaction" ADD CONSTRAINT "BugMessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugMessageReadReceipt" ADD CONSTRAINT "BugMessageReadReceipt_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "BugMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugMessageReadReceipt" ADD CONSTRAINT "BugMessageReadReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugMessage" ADD CONSTRAINT "BugMessage_bugId_fkey" FOREIGN KEY ("bugId") REFERENCES "Bug"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugMessage" ADD CONSTRAINT "BugMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "BugMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugMessage" ADD CONSTRAINT "BugMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
