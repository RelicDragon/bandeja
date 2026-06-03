-- Backfill Club.sports from distinct Court.sport per club (PADEL when no tagged courts).
UPDATE "Club" c
SET "sports" = sub.sports
FROM (
  SELECT
    ct."clubId",
    COALESCE(
      ARRAY(
        SELECT DISTINCT ct2.sport
        FROM "Court" ct2
        WHERE ct2."clubId" = ct."clubId" AND ct2.sport IS NOT NULL
        ORDER BY ct2.sport
      ),
      ARRAY['PADEL']::"Sport"[]
    ) AS sports
  FROM "Court" ct
  GROUP BY ct."clubId"
) sub
WHERE c.id = sub."clubId";
