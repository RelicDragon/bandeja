/*
  Warnings:

  - You are about to drop the `JoinQueue` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "padelpulse"."JoinQueue" DROP CONSTRAINT "JoinQueue_gameId_fkey";

-- DropForeignKey
ALTER TABLE "padelpulse"."JoinQueue" DROP CONSTRAINT "JoinQueue_userId_fkey";

-- DropTable
DROP TABLE "padelpulse"."JoinQueue";
