-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sendPushWalletNotifications" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sendTelegramWalletNotifications" BOOLEAN NOT NULL DEFAULT true;
