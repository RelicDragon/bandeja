-- CreateEnum
CREATE TYPE "MarketItemTradeType" AS ENUM ('BUY_IT_NOW', 'SUGGESTED_PRICE', 'AUCTION');

-- CreateEnum
CREATE TYPE "MarketItemStatus" AS ENUM ('ACTIVE', 'SOLD', 'RESERVED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "MarketItemCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketItemCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketItem" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "mediaUrls" TEXT[],
    "tradeType" "MarketItemTradeType" NOT NULL,
    "priceCents" INTEGER,
    "currency" "PriceCurrency" NOT NULL DEFAULT 'EUR',
    "auctionEndsAt" TIMESTAMP(3),
    "status" "MarketItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketItem_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "GroupChannel" ADD COLUMN "marketItemId" TEXT;

-- CreateIndex
CREATE INDEX "MarketItemCategory_isActive_idx" ON "MarketItemCategory"("isActive");

-- CreateIndex
CREATE INDEX "MarketItemCategory_order_idx" ON "MarketItemCategory"("order");

-- CreateIndex
CREATE INDEX "MarketItem_sellerId_idx" ON "MarketItem"("sellerId");

-- CreateIndex
CREATE INDEX "MarketItem_categoryId_idx" ON "MarketItem"("categoryId");

-- CreateIndex
CREATE INDEX "MarketItem_cityId_idx" ON "MarketItem"("cityId");

-- CreateIndex
CREATE INDEX "MarketItem_status_idx" ON "MarketItem"("status");

-- CreateIndex
CREATE INDEX "MarketItem_tradeType_idx" ON "MarketItem"("tradeType");

-- CreateIndex
CREATE INDEX "MarketItem_createdAt_idx" ON "MarketItem"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GroupChannel_marketItemId_key" ON "GroupChannel"("marketItemId");

-- CreateIndex
CREATE INDEX "GroupChannel_marketItemId_idx" ON "GroupChannel"("marketItemId");

-- AddForeignKey
ALTER TABLE "MarketItem" ADD CONSTRAINT "MarketItem_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketItem" ADD CONSTRAINT "MarketItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MarketItemCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketItem" ADD CONSTRAINT "MarketItem_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupChannel" ADD CONSTRAINT "GroupChannel_marketItemId_fkey" FOREIGN KEY ("marketItemId") REFERENCES "MarketItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
