-- CreateEnum
CREATE TYPE "BugStatus" AS ENUM ('CREATED', 'CONFIRMED', 'IN_PROGRESS', 'TEST', 'FINISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BugType" AS ENUM ('BUG', 'CRITICAL', 'SUGGESTION', 'QUESTION');

-- CreateTable
CREATE TABLE "Bug" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "status" "BugStatus" NOT NULL DEFAULT 'CREATED',
    "bugType" "BugType" NOT NULL DEFAULT 'BUG',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bug_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Bug_senderId_idx" ON "Bug"("senderId");

-- CreateIndex
CREATE INDEX "Bug_status_idx" ON "Bug"("status");

-- CreateIndex
CREATE INDEX "Bug_bugType_idx" ON "Bug"("bugType");

-- AddForeignKey
ALTER TABLE "Bug" ADD CONSTRAINT "Bug_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
