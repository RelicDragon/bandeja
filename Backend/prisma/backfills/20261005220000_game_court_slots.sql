-- CreateEnum
CREATE TYPE "GameCourtReservation" AS ENUM ('NONE', 'REPORTED');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "reportedAnyCourtCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "GameExternalBooking" ADD COLUMN     "gameCourtId" TEXT;

-- AlterTable
ALTER TABLE "GameCourt" ADD COLUMN     "reportedAt" TIMESTAMP(3),
ADD COLUMN     "reportedById" TEXT,
ADD COLUMN     "reservation" "GameCourtReservation" NOT NULL DEFAULT 'NONE';

-- CreateIndex
CREATE INDEX "GameExternalBooking_gameCourtId_idx" ON "GameExternalBooking"("gameCourtId");

-- CreateIndex
CREATE INDEX "GameCourt_reportedById_idx" ON "GameCourt"("reportedById");

-- AddForeignKey
ALTER TABLE "GameExternalBooking" ADD CONSTRAINT "GameExternalBooking_gameCourtId_fkey" FOREIGN KEY ("gameCourtId") REFERENCES "GameCourt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameCourt" ADD CONSTRAINT "GameCourt_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Backfill: court slots (docs/domains/booking.md "Court slots").
-- Every statement is guarded so re-running it is a no-op.
-- ---------------------------------------------------------------------------

-- (a) Every game with a primary court gets a GameCourt slot for it, appended
--     after any existing slots (orders are 1-based, like GameCourtService).
INSERT INTO "GameCourt" ("id", "gameId", "courtId", "order", "reservation", "createdAt", "updatedAt")
SELECT
  concat('gcs_', replace(gen_random_uuid()::text, '-', '')),
  g."id",
  g."courtId",
  COALESCE(mx."maxOrder", 0) + 1,
  'NONE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Game" g
LEFT JOIN (
  SELECT "gameId", MAX("order") AS "maxOrder" FROM "GameCourt" GROUP BY "gameId"
) mx ON mx."gameId" = g."id"
WHERE g."courtId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "GameCourt" gc WHERE gc."gameId" = g."id" AND gc."courtId" = g."courtId"
  )
ON CONFLICT DO NOTHING;

-- (a2) A linked booking on a court the game does not list gets its own slot too
--      (same rule as linking a booking now), in first-linked order.
INSERT INTO "GameCourt" ("id", "gameId", "courtId", "order", "reservation", "createdAt", "updatedAt")
SELECT
  concat('gcs_', replace(gen_random_uuid()::text, '-', '')),
  m."gameId",
  m."courtId",
  COALESCE(mx."maxOrder", 0) + ROW_NUMBER() OVER (PARTITION BY m."gameId" ORDER BY m."firstLinkedAt", m."courtId"),
  'NONE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT b."gameId", b."courtId", MIN(b."createdAt") AS "firstLinkedAt"
  FROM "GameExternalBooking" b
  WHERE b."courtId" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM "GameCourt" gc WHERE gc."gameId" = b."gameId" AND gc."courtId" = b."courtId"
    )
  GROUP BY b."gameId", b."courtId"
) m
LEFT JOIN (
  SELECT "gameId", MAX("order") AS "maxOrder" FROM "GameCourt" GROUP BY "gameId"
) mx ON mx."gameId" = m."gameId"
ON CONFLICT DO NOTHING;

-- (b) Place every linked booking on the slot for its court.
UPDATE "GameExternalBooking" b
SET "gameCourtId" = gc."id"
FROM "GameCourt" gc
WHERE b."gameCourtId" IS NULL
  AND b."courtId" IS NOT NULL
  AND gc."gameId" = b."gameId"
  AND gc."courtId" = b."courtId";

-- (c) "Court booked" without a linked booking was a manual report: mark every
--     slot REPORTED; a game without slots reports one unspecified court.
UPDATE "GameCourt" gc
SET "reservation" = 'REPORTED'
FROM "Game" g
WHERE gc."gameId" = g."id"
  AND g."hasBookedCourt" = true
  AND gc."reservation" = 'NONE'
  AND NOT EXISTS (SELECT 1 FROM "GameExternalBooking" b WHERE b."gameId" = g."id");

UPDATE "Game" g
SET "reportedAnyCourtCount" = 1
WHERE g."hasBookedCourt" = true
  AND g."reportedAnyCourtCount" = 0
  AND NOT EXISTS (SELECT 1 FROM "GameExternalBooking" b WHERE b."gameId" = g."id")
  AND NOT EXISTS (SELECT 1 FROM "GameCourt" gc WHERE gc."gameId" = g."id");
