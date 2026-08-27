-- Preserve imageUrl/imageUrlDark as the first, static frame for older clients.
ALTER TABLE "AdCreative"
ADD COLUMN "imageUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "imageUrlsDark" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "AdCreative"
SET
  "imageUrls" = ARRAY["imageUrl"],
  "imageUrlsDark" = CASE
    WHEN "imageUrlDark" IS NULL THEN ARRAY[]::TEXT[]
    ELSE ARRAY["imageUrlDark"]
  END;
