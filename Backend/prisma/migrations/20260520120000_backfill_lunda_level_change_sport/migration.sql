-- Legacy LUNDA sync wrote competitive level changes before Sport existed; treat as padel.
UPDATE "LevelChangeEvent"
SET "sport" = 'PADEL'
WHERE "sport" IS NULL
  AND "eventType" = 'LUNDA';
