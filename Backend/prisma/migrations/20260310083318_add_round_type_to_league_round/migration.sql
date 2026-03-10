-- CreateEnum
CREATE TYPE "RoundType" AS ENUM ('REGULAR', 'PLAYOFF');

-- AlterTable
ALTER TABLE "LeagueRound" ADD COLUMN     "roundType" "RoundType" NOT NULL DEFAULT 'REGULAR';
