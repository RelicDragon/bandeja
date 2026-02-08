ALTER TABLE "MarketItem" ADD COLUMN "tradeTypes" "MarketItemTradeType"[] DEFAULT '{}';

UPDATE "MarketItem" SET "tradeTypes" = ARRAY["tradeType"]::"MarketItemTradeType"[];

ALTER TABLE "MarketItem" ALTER COLUMN "tradeTypes" SET NOT NULL;

DROP INDEX IF EXISTS "MarketItem_tradeType_idx";

ALTER TABLE "MarketItem" DROP COLUMN "tradeType";
