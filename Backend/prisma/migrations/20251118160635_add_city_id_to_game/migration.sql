-- AlterTable
ALTER TABLE "padelpulse"."Game" ADD COLUMN     "cityId" TEXT;

-- Backfill cityId from club or court
UPDATE "padelpulse"."Game" 
SET "cityId" = (
  SELECT "padelpulse"."Club"."cityId"
  FROM "padelpulse"."Club"
  WHERE "padelpulse"."Club"."id" = "padelpulse"."Game"."clubId"
)
WHERE "padelpulse"."Game"."clubId" IS NOT NULL AND "padelpulse"."Game"."cityId" IS NULL;

UPDATE "padelpulse"."Game"
SET "cityId" = (
  SELECT "padelpulse"."Club"."cityId"
  FROM "padelpulse"."Court"
  JOIN "padelpulse"."Club" ON "padelpulse"."Court"."clubId" = "padelpulse"."Club"."id"
  WHERE "padelpulse"."Court"."id" = "padelpulse"."Game"."courtId"
)
WHERE "padelpulse"."Game"."courtId" IS NOT NULL AND "padelpulse"."Game"."cityId" IS NULL;

-- CreateIndex
CREATE INDEX "Game_cityId_idx" ON "padelpulse"."Game"("cityId");

-- AddForeignKey
ALTER TABLE "padelpulse"."Game" ADD CONSTRAINT "Game_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "padelpulse"."City"("id") ON DELETE SET NULL ON UPDATE CASCADE;
