-- CreateTable
CREATE TABLE "GamePhoto" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "uploaderId" TEXT,
    "originalUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "thumbWidth" INTEGER,
    "thumbHeight" INTEGER,
    "byteSize" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "clientUploadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "GamePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GamePhoto_gameId_deletedAt_createdAt_idx" ON "GamePhoto"("gameId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "GamePhoto_uploaderId_idx" ON "GamePhoto"("uploaderId");

-- CreateIndex
CREATE UNIQUE INDEX "GamePhoto_uploaderId_clientUploadId_key" ON "GamePhoto"("uploaderId", "clientUploadId");

-- CreateIndex
CREATE UNIQUE INDEX "Game_mainPhotoId_key" ON "Game"("mainPhotoId");

-- CreateIndex
CREATE INDEX "Game_mainPhotoId_idx" ON "Game"("mainPhotoId");

-- AddForeignKey
ALTER TABLE "GamePhoto" ADD CONSTRAINT "GamePhoto_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePhoto" ADD CONSTRAINT "GamePhoto_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
