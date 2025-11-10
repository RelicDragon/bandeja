/*
  Warnings:

  - The values [BY_ROUNDS_WON] on the enum `WinnerOfGame` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `winnerOfRound` on the `Game` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
update padelpulse."Game" set "winnerOfGame"='BY_MATCHES_WON' where "winnerOfGame"='BY_ROUNDS_WON';
CREATE TYPE "padelpulse"."WinnerOfGame_new" AS ENUM ('BY_MATCHES_WON', 'BY_POINTS', 'BY_SCORES_DELTA', 'PLAYOFF_FINALS');
ALTER TABLE "padelpulse"."Game" ALTER COLUMN "winnerOfGame" DROP DEFAULT;
ALTER TABLE "padelpulse"."Game" ALTER COLUMN "winnerOfGame" TYPE "WinnerOfGame_new" USING ("winnerOfGame"::text::"WinnerOfGame_new");
ALTER TYPE "padelpulse"."WinnerOfGame" RENAME TO "WinnerOfGame_old";
ALTER TYPE "padelpulse"."WinnerOfGame_new" RENAME TO "WinnerOfGame";
DROP TYPE "padelpulse"."WinnerOfGame_old";
ALTER TABLE "padelpulse"."Game" ALTER COLUMN "winnerOfGame" SET DEFAULT 'BY_MATCHES_WON';
COMMIT;

-- AlterTable
ALTER TABLE "padelpulse"."Game" DROP COLUMN "winnerOfRound",
ALTER COLUMN "winnerOfGame" SET DEFAULT 'BY_MATCHES_WON';

-- DropEnum
DROP TYPE "padelpulse"."WinnerOfRound";
