-- Round the stored level band to the 0.1 slider grid.
--
-- Until the create flow started snapping it, a game's band was seeded from the
-- host's raw rating (level ± 0.7) and submitted untouched, so `minLevel` and
-- `maxLevel` hold values like 2.045097134590984. The band is not only shown --
-- it is enforced by the availability and play-intent filters -- so an off-grid
-- bound silently disagrees with the rounded label every surface renders.
--
-- Rounds to NEAREST, matching `toFixed(1)` at render and `snapToStep` in the
-- create flow. That keeps every label users have already been shown exactly as
-- it is, and makes matching honour the band as advertised: a game displaying
-- "level 2.0-3.4" stops quietly accepting a 3.44 player.
--
-- Rounding outward instead (min down, max up) would avoid ever dropping a
-- borderline player, but it would move maxLevel onto the next grid step on
-- roughly half these rows -- changing "3.4" to "3.5" on live and historical
-- listings alike. Preferred stable labels over a <=0.05 change in reach.
--
-- `::numeric` first so the arithmetic is exact decimal, not binary float: the
-- predicate and the new value then agree, and a bound already on the grid is
-- left untouched rather than rewritten by float dust.

UPDATE "Game"
SET "minLevel" = round("minLevel"::numeric, 1)
WHERE "minLevel" IS NOT NULL
  AND round("minLevel"::numeric, 1) <> "minLevel"::numeric;

UPDATE "Game"
SET "maxLevel" = round("maxLevel"::numeric, 1)
WHERE "maxLevel" IS NOT NULL
  AND round("maxLevel"::numeric, 1) <> "maxLevel"::numeric;

-- The same band lives on these two, seeded from the same create/compose flows.
-- Both are clean today, so these are no-ops that keep the grid invariant true
-- everywhere it is enforced rather than leaving a gap for the next backfill.

UPDATE "PlayIntent"
SET "minLevel" = round("minLevel"::numeric, 1)
WHERE "minLevel" IS NOT NULL
  AND round("minLevel"::numeric, 1) <> "minLevel"::numeric;

UPDATE "PlayIntent"
SET "maxLevel" = round("maxLevel"::numeric, 1)
WHERE "maxLevel" IS NOT NULL
  AND round("maxLevel"::numeric, 1) <> "maxLevel"::numeric;

UPDATE "GameSubscription"
SET "minLevel" = round("minLevel"::numeric, 1)
WHERE "minLevel" IS NOT NULL
  AND round("minLevel"::numeric, 1) <> "minLevel"::numeric;

UPDATE "GameSubscription"
SET "maxLevel" = round("maxLevel"::numeric, 1)
WHERE "maxLevel" IS NOT NULL
  AND round("maxLevel"::numeric, 1) <> "maxLevel"::numeric;
