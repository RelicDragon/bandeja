-- AlterTable
ALTER TABLE "City" ADD COLUMN     "telegramPinnedLanguage" TEXT NOT NULL DEFAULT 'en-US',
ADD COLUMN     "telegramPinnedMessageId" TEXT;
