/*
  Warnings:

  - A unique constraint covering the columns `[pollId]` on the table `ChatMessage` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "PollType" AS ENUM ('CLASSICAL', 'MULTI_ANSWER', 'QUIZ');

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "pollId" TEXT;

-- CreateTable
CREATE TABLE "Poll" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "type" "PollType" NOT NULL DEFAULT 'CLASSICAL',
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "allowsMultipleAnswers" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "messageId" TEXT NOT NULL,

    CONSTRAINT "Poll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollOption" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "pollId" TEXT NOT NULL,

    CONSTRAINT "PollOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollVote" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Poll_messageId_key" ON "Poll"("messageId");

-- CreateIndex
CREATE INDEX "PollOption_pollId_idx" ON "PollOption"("pollId");

-- CreateIndex
CREATE INDEX "PollVote_pollId_idx" ON "PollVote"("pollId");

-- CreateIndex
CREATE INDEX "PollVote_userId_idx" ON "PollVote"("userId");

-- CreateIndex
CREATE INDEX "PollVote_optionId_idx" ON "PollVote"("optionId");

-- CreateIndex
CREATE UNIQUE INDEX "PollVote_userId_optionId_key" ON "PollVote"("userId", "optionId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_pollId_key" ON "ChatMessage"("pollId");

-- AddForeignKey
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollOption" ADD CONSTRAINT "PollOption_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "PollOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
