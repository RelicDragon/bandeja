-- AlterTable
-- Level snapshot taken when a Sport Level Confirmation is recorded; `level` keeps moving afterwards.
ALTER TABLE "UserSportProfile" ADD COLUMN     "approvedAtLevel" DOUBLE PRECISION;

-- Best-effort backfill for confirmations recorded before the column existed: the rated
-- outcome closest to `approvedWhen` in the same sport (the confirming training, within a day).
UPDATE "UserSportProfile" p
SET "approvedAtLevel" = (
  SELECT o."levelAfter"
  FROM "GameOutcome" o
  JOIN "Game" g ON g."id" = o."gameId"
  WHERE o."userId" = p."userId"
    AND g."sport" = p."sport"
    AND o."createdAt" BETWEEN p."approvedWhen" - INTERVAL '1 day' AND p."approvedWhen" + INTERVAL '1 day'
  ORDER BY ABS(EXTRACT(EPOCH FROM (o."createdAt" - p."approvedWhen"))) ASC
  LIMIT 1
)
WHERE p."approvedLevel" = TRUE
  AND p."approvedWhen" IS NOT NULL
  AND p."approvedAtLevel" IS NULL;
