ALTER TABLE "PlayIntent"
ADD COLUMN "timeOfDays" "PlayIntentTimeOfDay"[] NOT NULL
DEFAULT ARRAY[]::"PlayIntentTimeOfDay"[];

-- Preserve every existing intent's single period while new clients can store
-- several alternatives (for example MORNING + EVENING).
UPDATE "PlayIntent"
SET "timeOfDays" = ARRAY["timeOfDay"];
