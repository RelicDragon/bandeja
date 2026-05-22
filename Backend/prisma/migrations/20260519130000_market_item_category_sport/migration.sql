-- AlterTable
ALTER TABLE "MarketItemCategory" ADD COLUMN     "sport" "Sport";

-- CreateIndex
CREATE INDEX "MarketItemCategory_sport_idx" ON "MarketItemCategory"("sport");
