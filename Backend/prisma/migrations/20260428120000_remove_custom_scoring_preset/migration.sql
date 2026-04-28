-- AlterEnum
BEGIN;
CREATE TYPE "padelpulse"."ScoringPreset_new" AS ENUM ('CLASSIC_BEST_OF_3', 'CLASSIC_BEST_OF_5', 'CLASSIC_PRO_SET', 'CLASSIC_SHORT_SET', 'CLASSIC_SUPER_TIEBREAK', 'CLASSIC_SINGLE_SET', 'CLASSIC_TIMED', 'POINTS_16', 'POINTS_21', 'POINTS_24', 'POINTS_32', 'TIMED', 'CUSTOM');
ALTER TABLE "padelpulse"."Game" ALTER COLUMN "scoringPreset" TYPE "padelpulse"."ScoringPreset_new" USING ("scoringPreset"::text::"padelpulse"."ScoringPreset_new");
ALTER TYPE "padelpulse"."ScoringPreset" RENAME TO "ScoringPreset_old";
ALTER TYPE "padelpulse"."ScoringPreset_new" RENAME TO "ScoringPreset";
DROP TYPE "padelpulse"."ScoringPreset_old";
COMMIT;
