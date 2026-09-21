-- PRD 348 — structured, country-scoped "how to pay the organiser back".
--
-- `Game.paymentHint` stays as a one-line mirror for app builds shipped before the
-- catalogue; `Game.paymentMethods` becomes the source of truth.

-- AlterTable
ALTER TABLE "Game" ADD COLUMN "paymentMethods" JSONB;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "payoutMethods" JSONB;

-- Every free-text hint written before the catalogue is exactly one CUSTOM entry.
UPDATE "Game"
SET "paymentMethods" = jsonb_build_array(
  jsonb_build_object('method', 'CUSTOM', 'handle', btrim("paymentHint"))
)
WHERE "paymentMethods" IS NULL
  AND "paymentHint" IS NOT NULL
  AND btrim("paymentHint") <> '';
