-- CreateTable
CREATE TABLE "PinnedUserChat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userChatId" TEXT NOT NULL,
    "pinnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PinnedUserChat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PinnedUserChat_userId_idx" ON "PinnedUserChat"("userId");

-- CreateIndex
CREATE INDEX "PinnedUserChat_userChatId_idx" ON "PinnedUserChat"("userChatId");

-- CreateIndex
CREATE UNIQUE INDEX "PinnedUserChat_userId_userChatId_key" ON "PinnedUserChat"("userId", "userChatId");

-- AddForeignKey
ALTER TABLE "PinnedUserChat" ADD CONSTRAINT "PinnedUserChat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PinnedUserChat" ADD CONSTRAINT "PinnedUserChat_userChatId_fkey" FOREIGN KEY ("userChatId") REFERENCES "UserChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
