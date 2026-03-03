-- AlterTable
ALTER TABLE "TelegramOtp" ADD COLUMN     "linkKey" VARCHAR(64),
ADD COLUMN     "linkMessageId" VARCHAR(255);

-- CreateIndex
CREATE INDEX "TelegramOtp_linkKey_idx" ON "TelegramOtp"("linkKey");
