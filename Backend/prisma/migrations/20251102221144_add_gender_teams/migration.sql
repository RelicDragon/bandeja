-- CreateEnum
CREATE TYPE "GenderTeam" AS ENUM ('ANY', 'MEN', 'WOMEN', 'MIX_PAIRS');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "genderTeams" "GenderTeam" NOT NULL DEFAULT 'ANY';
