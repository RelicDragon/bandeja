-- AlterTable
ALTER TABLE "LeagueGroup" ADD COLUMN     "color" TEXT;

WITH palette AS (
  SELECT ARRAY[
    '#4F46E5',
    '#6366F1',
    '#8B5CF6',
    '#EC4899',
    '#F472B6',
    '#0EA5E9',
    '#06B6D4',
    '#14B8A6',
    '#10B981',
    '#84CC16',
    '#F59E0B',
    '#F97316'
  ]::text[] AS colors
)
UPDATE "LeagueGroup"
SET "color" = palette.colors[1 + (floor(random() * array_length(palette.colors, 1))::int)]
FROM palette
WHERE "LeagueGroup"."color" IS NULL;
