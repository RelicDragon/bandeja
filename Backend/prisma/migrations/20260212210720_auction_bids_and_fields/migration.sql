-- CreateEnum
CREATE TYPE "AuctionType" AS ENUM ('RISING', 'HOLLAND');

-- AlterTable
ALTER TABLE "MarketItem" ADD COLUMN     "auctionType" "AuctionType",
ADD COLUMN     "buyItNowPriceCents" INTEGER,
ADD COLUMN     "currentPriceCents" INTEGER,
ADD COLUMN     "hollandDecrementCents" INTEGER,
ADD COLUMN     "hollandIntervalMinutes" INTEGER,
ADD COLUMN     "startingPriceCents" INTEGER,
ADD COLUMN     "winnerId" TEXT,
ALTER COLUMN "mediaUrls" SET DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "MarketItemBid" (
    "id" TEXT NOT NULL,
    "marketItemId" TEXT NOT NULL,
    "bidderId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "outbidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketItemBid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketItemBid_marketItemId_idx" ON "MarketItemBid"("marketItemId");

-- CreateIndex
CREATE INDEX "MarketItemBid_bidderId_idx" ON "MarketItemBid"("bidderId");

-- CreateIndex
CREATE INDEX "MarketItemBid_marketItemId_createdAt_idx" ON "MarketItemBid"("marketItemId", "createdAt");

-- CreateIndex
CREATE INDEX "MarketItem_winnerId_idx" ON "MarketItem"("winnerId");

-- AddForeignKey
ALTER TABLE "MarketItem" ADD CONSTRAINT "MarketItem_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketItemBid" ADD CONSTRAINT "MarketItemBid_marketItemId_fkey" FOREIGN KEY ("marketItemId") REFERENCES "MarketItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketItemBid" ADD CONSTRAINT "MarketItemBid_bidderId_fkey" FOREIGN KEY ("bidderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
