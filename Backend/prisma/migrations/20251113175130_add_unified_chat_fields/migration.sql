-- CreateEnum
CREATE TYPE "ChatContextType" AS ENUM ('GAME', 'BUG', 'USER');

-- DropForeignKey
ALTER TABLE "padelpulse"."ChatMessage" DROP CONSTRAINT "ChatMessage_gameId_fkey";

-- AlterTable
ALTER TABLE "padelpulse"."ChatMessage" ADD COLUMN     "chatContextType" "ChatContextType" NOT NULL DEFAULT 'GAME',
ADD COLUMN     "contextId" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "gameId" DROP NOT NULL;

-- Migrate existing ChatMessage data: copy gameId to contextId
UPDATE "padelpulse"."ChatMessage" 
SET "contextId" = "gameId", 
    "chatContextType" = 'GAME'
WHERE "gameId" IS NOT NULL;

-- Migrate BugMessage data to ChatMessage
INSERT INTO "padelpulse"."ChatMessage" (
  "id",
  "chatContextType",
  "contextId",
  "senderId",
  "content",
  "mediaUrls",
  "thumbnailUrls",
  "state",
  "chatType",
  "createdAt",
  "updatedAt",
  "replyToId"
)
SELECT 
  "id",
  'BUG'::"ChatContextType" as "chatContextType",
  "bugId" as "contextId",
  "senderId",
  "content",
  "mediaUrls",
  "thumbnailUrls",
  "state",
  "chatType",
  "createdAt",
  "updatedAt",
  "replyToId"
FROM "padelpulse"."BugMessage";

-- Migrate BugMessageReaction to MessageReaction
INSERT INTO "padelpulse"."MessageReaction" (
  "id",
  "messageId",
  "userId",
  "emoji",
  "createdAt"
)
SELECT 
  "id",
  "messageId",
  "userId",
  "emoji",
  "createdAt"
FROM "padelpulse"."BugMessageReaction"
ON CONFLICT ("messageId", "userId") DO NOTHING;

-- Migrate BugMessageReadReceipt to MessageReadReceipt
INSERT INTO "padelpulse"."MessageReadReceipt" (
  "id",
  "messageId",
  "userId",
  "readAt"
)
SELECT 
  "id",
  "messageId",
  "userId",
  "readAt"
FROM "padelpulse"."BugMessageReadReceipt"
ON CONFLICT ("messageId", "userId") DO NOTHING;

-- Drop BugMessage related tables
DROP TABLE IF EXISTS "padelpulse"."BugMessageReaction";
DROP TABLE IF EXISTS "padelpulse"."BugMessageReadReceipt";
DROP TABLE IF EXISTS "padelpulse"."BugMessage";

-- CreateTable
CREATE TABLE "padelpulse"."UserChat" (
    "id" TEXT NOT NULL,
    "user1Id" TEXT NOT NULL,
    "user2Id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserChat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserChat_user1Id_idx" ON "padelpulse"."UserChat"("user1Id");

-- CreateIndex
CREATE INDEX "UserChat_user2Id_idx" ON "padelpulse"."UserChat"("user2Id");

-- CreateIndex
CREATE INDEX "UserChat_updatedAt_idx" ON "padelpulse"."UserChat"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserChat_user1Id_user2Id_key" ON "padelpulse"."UserChat"("user1Id", "user2Id");

-- CreateIndex
CREATE INDEX "ChatMessage_chatContextType_contextId_idx" ON "padelpulse"."ChatMessage"("chatContextType", "contextId");

-- CreateIndex
CREATE INDEX "ChatMessage_contextId_idx" ON "padelpulse"."ChatMessage"("contextId");

-- AddForeignKey
ALTER TABLE "padelpulse"."UserChat" ADD CONSTRAINT "UserChat_user1Id_fkey" FOREIGN KEY ("user1Id") REFERENCES "padelpulse"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "padelpulse"."UserChat" ADD CONSTRAINT "UserChat_user2Id_fkey" FOREIGN KEY ("user2Id") REFERENCES "padelpulse"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
