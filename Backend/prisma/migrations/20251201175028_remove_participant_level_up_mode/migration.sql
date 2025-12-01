/*
  Warnings:

  - You are about to drop the column `participantLevelUpMode` on the `Game` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Game" DROP COLUMN "participantLevelUpMode";

-- DropEnum
DROP TYPE "padelpulse"."ParticipantLevelUpMode";
