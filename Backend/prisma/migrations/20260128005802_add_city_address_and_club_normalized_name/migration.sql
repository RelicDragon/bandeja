-- AlterTable
ALTER TABLE "City" ADD COLUMN     "administrativeArea" TEXT,
ADD COLUMN     "subAdministrativeArea" TEXT;

-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "normalizedName" TEXT;
UPDATE "Club" SET "normalizedName" = lower(trim(regexp_replace("name", '\s+', ' ', 'g')));
ALTER TABLE "Club" ALTER COLUMN "normalizedName" SET NOT NULL;
ALTER TABLE "Club" ALTER COLUMN "normalizedName" SET DEFAULT '';

-- CreateIndex
CREATE INDEX "Club_normalizedName_idx" ON "Club"("normalizedName");
