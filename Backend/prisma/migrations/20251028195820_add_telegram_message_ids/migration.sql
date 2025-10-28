-- AlterTable
ALTER TABLE "TelegramOtp" ADD COLUMN     "chatId" VARCHAR(255),
ADD COLUMN     "codeMessageId" VARCHAR(255),
ADD COLUMN     "textMessageId" VARCHAR(255);
