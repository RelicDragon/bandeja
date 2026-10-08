-- Remove the PRD 348 payment-method catalogue ("how players should pay you").
-- The cost-split ledger (GameCostShare, costPayerId, price/currency) stays.
ALTER TABLE "Game" DROP COLUMN "paymentHint",
DROP COLUMN "paymentMethods";

ALTER TABLE "User" DROP COLUMN "payoutMethods";
