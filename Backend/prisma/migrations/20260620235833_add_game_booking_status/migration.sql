-- CreateEnum
CREATE TYPE "GameBookingStatus" AS ENUM ('NONE', 'MANUAL', 'EXTERNAL_PARTIAL', 'EXTERNAL_FULL');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "bookingStatus" "GameBookingStatus" NOT NULL DEFAULT 'NONE';
