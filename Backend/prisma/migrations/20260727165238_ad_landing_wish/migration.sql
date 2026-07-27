-- CreateEnum
CREATE TYPE "AdLandingDonationIntent" AS ENUM ('NONE', 'RSD', 'RUB');

-- CreateTable
CREATE TABLE "AdLandingWish" (
    "id" TEXT NOT NULL,
    "landingKey" TEXT NOT NULL,
    "userId" TEXT,
    "campaignId" TEXT,
    "displayName" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "donationIntent" "AdLandingDonationIntent" NOT NULL DEFAULT 'NONE',
    "locale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdLandingWish_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdLandingWish_landingKey_createdAt_idx" ON "AdLandingWish"("landingKey", "createdAt");

-- CreateIndex
CREATE INDEX "AdLandingWish_userId_idx" ON "AdLandingWish"("userId");

-- CreateIndex
CREATE INDEX "AdLandingWish_campaignId_idx" ON "AdLandingWish"("campaignId");

-- AddForeignKey
ALTER TABLE "AdLandingWish" ADD CONSTRAINT "AdLandingWish_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdLandingWish" ADD CONSTRAINT "AdLandingWish_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
