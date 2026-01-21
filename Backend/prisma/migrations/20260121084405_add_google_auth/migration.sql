/*
  Warnings:

  - A unique constraint covering the columns `[googleId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "AuthProvider" ADD VALUE 'GOOGLE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "googleEmail" TEXT,
ADD COLUMN     "googleEmailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "googleId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
