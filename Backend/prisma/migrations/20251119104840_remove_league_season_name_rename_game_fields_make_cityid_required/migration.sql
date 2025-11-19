/*
  Warnings:

  - You are about to drop the column `avatar` on the `LeagueSeason` table. All the data in the column will be lost.
  - You are about to drop the column `gameSetupPlayoffId` on the `LeagueSeason` table. All the data in the column will be lost.
  - You are about to drop the column `gameSetupSeasonId` on the `LeagueSeason` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `LeagueSeason` table. All the data in the column will be lost.
  - Made the column `cityId` on table `Game` required. This step will fail if there are existing NULL values in that column.
  - Made the column `cityId` on table `League` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "padelpulse"."Game" DROP CONSTRAINT "Game_cityId_fkey";

-- DropForeignKey
ALTER TABLE "padelpulse"."League" DROP CONSTRAINT "League_cityId_fkey";

-- DropForeignKey
ALTER TABLE "padelpulse"."LeagueSeason" DROP CONSTRAINT "LeagueSeason_gameSetupPlayoffId_fkey";

-- DropForeignKey
ALTER TABLE "padelpulse"."LeagueSeason" DROP CONSTRAINT "LeagueSeason_gameSetupSeasonId_fkey";

-- AlterTable
ALTER TABLE "Game" ALTER COLUMN "cityId" SET NOT NULL;

-- AlterTable
ALTER TABLE "League" ALTER COLUMN "cityId" SET NOT NULL;

-- AlterTable
ALTER TABLE "LeagueSeason" DROP COLUMN "avatar",
DROP COLUMN "gameSetupPlayoffId",
DROP COLUMN "gameSetupSeasonId",
DROP COLUMN "name",
ADD COLUMN     "gamePlayoffId" TEXT,
ADD COLUMN     "gameSeasonId" TEXT;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "League" ADD CONSTRAINT "League_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueSeason" ADD CONSTRAINT "LeagueSeason_gameSeasonId_fkey" FOREIGN KEY ("gameSeasonId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueSeason" ADD CONSTRAINT "LeagueSeason_gamePlayoffId_fkey" FOREIGN KEY ("gamePlayoffId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;
