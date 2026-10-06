-- CreateEnum
CREATE TYPE "CourtBookingMode" AS ENUM ('CLUB', 'GAME_ONLY');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "courtBookingMode" "CourtBookingMode" NOT NULL DEFAULT 'CLUB';
