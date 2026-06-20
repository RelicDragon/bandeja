-- AlterTable: replace hasGoldenPoint boolean with deucesBeforeGoldenPoint int
ALTER TABLE "Game" ADD COLUMN "deucesBeforeGoldenPoint" INTEGER;

UPDATE "Game"
SET "deucesBeforeGoldenPoint" = CASE WHEN "hasGoldenPoint" = true THEN 0 ELSE NULL END;

ALTER TABLE "Game" DROP COLUMN "hasGoldenPoint";
