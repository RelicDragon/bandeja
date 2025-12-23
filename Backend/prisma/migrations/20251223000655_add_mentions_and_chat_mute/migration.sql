-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "mentionIds" TEXT[];

-- CreateTable
CREATE TABLE "ChatMute" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chatContextType" "ChatContextType" NOT NULL,
    "contextId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatMute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatMute_userId_idx" ON "ChatMute"("userId");

-- CreateIndex
CREATE INDEX "ChatMute_chatContextType_contextId_idx" ON "ChatMute"("chatContextType", "contextId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMute_userId_chatContextType_contextId_key" ON "ChatMute"("userId", "chatContextType", "contextId");

-- AddForeignKey
ALTER TABLE "ChatMute" ADD CONSTRAINT "ChatMute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
