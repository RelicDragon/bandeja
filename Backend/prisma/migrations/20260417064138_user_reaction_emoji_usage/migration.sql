-- AlterTable
ALTER TABLE "User" ADD COLUMN     "reactionEmojiUsageVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "UserReactionEmojiStat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserReactionEmojiStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserReactionEmojiStat_userId_count_lastUsedAt_idx" ON "UserReactionEmojiStat"("userId", "count" DESC, "lastUsedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "UserReactionEmojiStat_userId_emoji_key" ON "UserReactionEmojiStat"("userId", "emoji");

-- AddForeignKey
ALTER TABLE "UserReactionEmojiStat" ADD CONSTRAINT "UserReactionEmojiStat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
