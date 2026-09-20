-- AlterTable
-- Sticker-pack goods unlock a real StickerPack rather than resolving it by assetKey string.
ALTER TABLE "Goods" ADD COLUMN     "stickerPackId" TEXT;

-- CreateIndex
CREATE INDEX "Goods_stickerPackId_idx" ON "Goods"("stickerPackId");

-- AddForeignKey
ALTER TABLE "Goods" ADD CONSTRAINT "Goods_stickerPackId_fkey" FOREIGN KEY ("stickerPackId") REFERENCES "StickerPack"("id") ON DELETE SET NULL ON UPDATE CASCADE;
