-- CreateEnum
CREATE TYPE "StorySourceType" AS ENUM ('USER_STORY_ITEM', 'GAME_PHOTO', 'GAME_CREATED', 'GAME_RESULT');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "shareGameCreationsToFollowers" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "shareGamePhotosToFollowers" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "shareGameResultsToFollowers" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "StoryView" (
    "id" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "sourceType" "StorySourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserStory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserStory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserStoryItem" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "mediaUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT NOT NULL,
    "posterUrl" TEXT,
    "messageType" "MessageType" NOT NULL,
    "videoDurationMs" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "overlayText" TEXT,
    "overlayStyle" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "clientUploadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "UserStoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoryView_ownerUserId_sourceId_idx" ON "StoryView"("ownerUserId", "sourceId");

-- CreateIndex
CREATE INDEX "StoryView_viewerId_ownerUserId_idx" ON "StoryView"("viewerId", "ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "StoryView_viewerId_sourceType_sourceId_key" ON "StoryView"("viewerId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "UserStory_userId_expiresAt_idx" ON "UserStory"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserStoryItem_storyId_clientUploadId_key" ON "UserStoryItem"("storyId", "clientUploadId");

-- CreateIndex
CREATE INDEX "UserStoryItem_storyId_sortOrder_idx" ON "UserStoryItem"("storyId", "sortOrder");

-- AddForeignKey
ALTER TABLE "StoryView" ADD CONSTRAINT "StoryView_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryView" ADD CONSTRAINT "StoryView_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStory" ADD CONSTRAINT "UserStory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStoryItem" ADD CONSTRAINT "UserStoryItem_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "UserStory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
