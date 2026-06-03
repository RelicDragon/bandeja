-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ScoringPreset" ADD VALUE 'CLASSIC_FAST4';
ALTER TYPE "ScoringPreset" ADD VALUE 'POINTS_12';
ALTER TYPE "ScoringPreset" ADD VALUE 'POINTS_15';
ALTER TYPE "ScoringPreset" ADD VALUE 'BEST_OF_3_15';
