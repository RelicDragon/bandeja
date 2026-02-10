-- AlterTable
ALTER TABLE "MarketItem" ADD COLUMN     "additionalCityIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
