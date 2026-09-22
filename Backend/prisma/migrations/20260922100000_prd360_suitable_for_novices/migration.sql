-- PRD 360 — "Novices welcome": one explicit organizer promise, shown as a tag
-- wherever the game is listed and filterable on Find.
--
-- Atmosphere only. The level range, gender rule, direct-join and queue rules are
-- untouched by this column, and it is never derived from any of them: existing
-- games keep the default `false` until an organizer turns the switch on.

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "suitableForNovices" BOOLEAN NOT NULL DEFAULT false;
