-- AlterTable
ALTER TABLE "StickerPack" ADD COLUMN     "ownerUserId" TEXT;

-- CreateIndex
CREATE INDEX "StickerPack_ownerUserId_idx" ON "StickerPack"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "StickerPack_ownerUserId_key" ON "StickerPack"("ownerUserId");

-- AddForeignKey
ALTER TABLE "StickerPack" ADD CONSTRAINT "StickerPack_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
