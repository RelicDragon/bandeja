ALTER TABLE "City" ADD COLUMN "clubsCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "City" c
SET "clubsCount" = (
  SELECT COUNT(*)::integer FROM "Club" cl
  WHERE cl."cityId" = c.id AND cl."isActive" = true
);

CREATE INDEX "City_clubsCount_idx" ON "City"("clubsCount");
