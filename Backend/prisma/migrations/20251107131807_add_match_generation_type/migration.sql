-- CreateEnum
CREATE TYPE "MatchGenerationType" AS ENUM ('HANDMADE', 'FIXED', 'RANDOM', 'ROUND_ROBIN', 'ESCALERA', 'RATING');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "matchGenerationType" "MatchGenerationType" NOT NULL DEFAULT 'HANDMADE';
