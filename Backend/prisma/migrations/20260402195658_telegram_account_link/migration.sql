-- AlterTable
ALTER TABLE "TelegramOtp" ADD COLUMN     "linkUserId" VARCHAR(255);

-- CreateTable
CREATE TABLE "TelegramAccountLinkIntent" (
    "id" TEXT NOT NULL,
    "token" VARCHAR(32) NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramAccountLinkIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramAccountLinkIntent_token_key" ON "TelegramAccountLinkIntent"("token");

-- CreateIndex
CREATE INDEX "TelegramAccountLinkIntent_userId_idx" ON "TelegramAccountLinkIntent"("userId");

-- CreateIndex
CREATE INDEX "TelegramOtp_linkUserId_idx" ON "TelegramOtp"("linkUserId");

-- AddForeignKey
ALTER TABLE "TelegramAccountLinkIntent" ADD CONSTRAINT "TelegramAccountLinkIntent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
