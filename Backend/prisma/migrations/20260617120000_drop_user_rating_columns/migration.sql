-- Drop legacy global padel rating mirror columns (ADR-Q13 / epic #149).
DROP INDEX IF EXISTS "User_level_idx";

ALTER TABLE "User" DROP COLUMN "level",
DROP COLUMN "reliability",
DROP COLUMN "gamesPlayed",
DROP COLUMN "gamesWon";
