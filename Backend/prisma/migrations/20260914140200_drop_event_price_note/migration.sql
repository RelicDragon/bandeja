-- AlterTable
ALTER TABLE "Game" DROP COLUMN IF EXISTS "priceNote";

-- DropEnum
DROP TYPE IF EXISTS "EventPriceNote";
