-- CreateEnum
CREATE TYPE "WinnerOfGame" AS ENUM ('BY_ROUNDS_WON', 'BY_MATCHES_WON', 'BY_POINTS', 'BY_SCORES_DELTA', 'PLAYOFF_FINALS');

-- CreateEnum
CREATE TYPE "WinnerOfRound" AS ENUM ('BY_MATCHES_WON', 'BY_SCORES_DELTA');

-- CreateEnum
CREATE TYPE "WinnerOfMatch" AS ENUM ('BY_SETS', 'BY_SCORES');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "winnerOfGame" "WinnerOfGame" NOT NULL DEFAULT 'BY_ROUNDS_WON',
ADD COLUMN     "winnerOfMatch" "WinnerOfMatch" NOT NULL DEFAULT 'BY_SCORES',
ADD COLUMN     "winnerOfRound" "WinnerOfRound" NOT NULL DEFAULT 'BY_MATCHES_WON';
