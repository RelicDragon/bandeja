/*
  Warnings:

  - You are about to drop the column `status` on the `Match` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `Round` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "padelpulse"."Match_status_idx";

-- DropIndex
DROP INDEX "padelpulse"."Round_status_idx";

-- AlterTable
ALTER TABLE "Match" DROP COLUMN "status";

-- AlterTable
ALTER TABLE "Round" DROP COLUMN "status";

-- DropEnum
DROP TYPE "padelpulse"."MatchStatus";

-- DropEnum
DROP TYPE "padelpulse"."RoundStatus";
