-- AlterTable
ALTER TABLE "GroupChannel" ADD COLUMN     "cityId" TEXT;

-- Set cityId for existing channels based on owner's currentCityId
UPDATE "GroupChannel"
SET "cityId" = (
  SELECT "currentCityId"
  FROM "User"
  WHERE "User"."id" = "GroupChannel"."ownerId"
)
WHERE "isChannel" = true;

-- CreateIndex
CREATE INDEX "GroupChannel_cityId_idx" ON "GroupChannel"("cityId");

-- AddForeignKey
ALTER TABLE "GroupChannel" ADD CONSTRAINT "GroupChannel_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;
