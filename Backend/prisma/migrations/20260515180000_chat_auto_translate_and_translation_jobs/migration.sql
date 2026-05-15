-- CreateEnum
CREATE TYPE "TranslationJobPriority" AS ENUM ('high', 'normal', 'low');

-- CreateEnum
CREATE TYPE "TranslationJobStatus" AS ENUM ('pending', 'running', 'done', 'failed');

-- CreateEnum
CREATE TYPE "TranslationJobSource" AS ENUM ('manual', 'auto', 'backfill');

-- AlterEnum
ALTER TYPE "ChatSyncEventType" ADD VALUE 'CHAT_AUTO_TRANSLATE_CONFIG_UPDATED';

-- CreateTable
CREATE TABLE "ChatAutoTranslateConfig" (
    "id" TEXT NOT NULL,
    "chatContextType" "ChatContextType" NOT NULL,
    "contextId" TEXT NOT NULL,
    "chatTypeKey" VARCHAR(16) NOT NULL DEFAULT '',
    "languageCodes" TEXT[],
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatAutoTranslateConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranslationJob" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "languageCode" VARCHAR(10) NOT NULL,
    "priority" "TranslationJobPriority" NOT NULL DEFAULT 'normal',
    "status" "TranslationJobStatus" NOT NULL DEFAULT 'pending',
    "source" "TranslationJobSource" NOT NULL DEFAULT 'auto',
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranslationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatAutoTranslateConfig_chatContextType_contextId_idx" ON "ChatAutoTranslateConfig"("chatContextType", "contextId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatAutoTranslateConfig_chatContextType_contextId_chatTypeKey_key" ON "ChatAutoTranslateConfig"("chatContextType", "contextId", "chatTypeKey");

-- CreateIndex
CREATE INDEX "TranslationJob_status_runAfter_priority_idx" ON "TranslationJob"("status", "runAfter", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "TranslationJob_messageId_languageCode_key" ON "TranslationJob"("messageId", "languageCode");
