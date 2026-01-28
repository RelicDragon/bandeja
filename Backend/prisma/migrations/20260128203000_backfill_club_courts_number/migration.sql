-- Backfill courtsNumber from Court count per club
UPDATE "Club" SET "courtsNumber" = (
  SELECT COUNT(*)::integer FROM "Court" WHERE "Court"."clubId" = "Club"."id"
);
