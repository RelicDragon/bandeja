-- CreateEnum
CREATE TYPE "PriceType" AS ENUM ('PER_PERSON', 'PER_TEAM', 'TOTAL', 'NOT_KNOWN');

-- CreateEnum
CREATE TYPE "PriceCurrency" AS ENUM ('EUR', 'RSD', 'RUB');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "priceCurrency" "PriceCurrency",
ADD COLUMN     "priceTotal" DOUBLE PRECISION,
ADD COLUMN     "priceType" "PriceType" NOT NULL DEFAULT 'NOT_KNOWN';
