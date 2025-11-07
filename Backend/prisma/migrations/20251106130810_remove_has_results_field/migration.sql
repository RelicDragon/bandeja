/*
  Warnings:

  - You are about to drop the column `hasResults` on the `Game` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "padelpulse"."Game_hasResults_idx";

-- AlterTable
ALTER TABLE "Game" DROP COLUMN "hasResults";
