/*
  Warnings:

  - A unique constraint covering the columns `[appleSub]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "AuthProvider" ADD VALUE 'APPLE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "appleEmail" TEXT,
ADD COLUMN     "appleEmailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "appleSub" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_appleSub_key" ON "User"("appleSub");
