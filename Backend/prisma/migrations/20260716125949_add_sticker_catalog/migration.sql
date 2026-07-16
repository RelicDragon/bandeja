-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "stickerEmoji" TEXT,
ADD COLUMN     "stickerId" TEXT;

-- CreateTable
CREATE TABLE "StickerPack" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sport" "Sport",
    "locale" TEXT,
    "isOfficial" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "coverStickerId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StickerPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sticker" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "title" TEXT,
    "staticUrl" TEXT NOT NULL,
    "animatedUrl" TEXT,
    "width" INTEGER NOT NULL DEFAULT 512,
    "height" INTEGER NOT NULL DEFAULT 512,
    "contentHash" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sticker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserStickerPrefs" (
    "userId" TEXT NOT NULL,
    "favorites" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recent" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserStickerPrefs_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "StickerPack_slug_key" ON "StickerPack"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "StickerPack_coverStickerId_key" ON "StickerPack"("coverStickerId");

-- CreateIndex
CREATE INDEX "StickerPack_isActive_sortOrder_idx" ON "StickerPack"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "StickerPack_sport_idx" ON "StickerPack"("sport");

-- CreateIndex
CREATE INDEX "Sticker_packId_sortOrder_idx" ON "Sticker"("packId", "sortOrder");

-- CreateIndex
CREATE INDEX "Sticker_isActive_idx" ON "Sticker"("isActive");

-- CreateIndex
CREATE INDEX "Sticker_contentHash_idx" ON "Sticker"("contentHash");

-- CreateIndex
CREATE INDEX "ChatMessage_stickerId_idx" ON "ChatMessage"("stickerId");

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_stickerId_fkey" FOREIGN KEY ("stickerId") REFERENCES "Sticker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StickerPack" ADD CONSTRAINT "StickerPack_coverStickerId_fkey" FOREIGN KEY ("coverStickerId") REFERENCES "Sticker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sticker" ADD CONSTRAINT "Sticker_packId_fkey" FOREIGN KEY ("packId") REFERENCES "StickerPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStickerPrefs" ADD CONSTRAINT "UserStickerPrefs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
