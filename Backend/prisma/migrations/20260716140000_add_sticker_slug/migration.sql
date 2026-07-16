-- AlterTable: add slug nullable first, backfill, then require + unique
ALTER TABLE "Sticker" ADD COLUMN "slug" TEXT;

UPDATE "Sticker" AS s
SET "slug" = COALESCE(
  NULLIF(lower(regexp_replace(COALESCE(s."title", ''), '[^a-zA-Z0-9]+', '-', 'g')), ''),
  'sticker'
) || '-' || substr(s."id", length(s."id") - 5)
WHERE s."slug" IS NULL;

ALTER TABLE "Sticker" ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "Sticker_packId_slug_key" ON "Sticker"("packId", "slug");
