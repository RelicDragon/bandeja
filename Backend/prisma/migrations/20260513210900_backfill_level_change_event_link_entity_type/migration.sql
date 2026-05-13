UPDATE "LevelChangeEvent" AS lce
SET "linkEntityType" = g."entityType"
FROM "Game" AS g
WHERE lce."gameId" = g."id"
  AND lce."linkEntityType" IS DISTINCT FROM g."entityType";
