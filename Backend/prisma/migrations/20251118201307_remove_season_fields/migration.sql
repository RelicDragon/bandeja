/*
  Warnings:

  - You are about to drop the column `maxLevel` on the `LeagueSeason` table. All the data in the column will be lost.
  - You are about to drop the column `maxParticipants` on the `LeagueSeason` table. All the data in the column will be lost.
  - You are about to drop the column `minLevel` on the `LeagueSeason` table. All the data in the column will be lost.
  - You are about to drop the column `startDate` on the `LeagueSeason` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "LeagueSeason" DROP COLUMN "maxLevel",
DROP COLUMN "maxParticipants",
DROP COLUMN "minLevel",
DROP COLUMN "startDate";
