-- CreateTable
CREATE TABLE "AdLandingRegistration" (
    "id" TEXT NOT NULL,
    "landingKey" TEXT NOT NULL,
    "tokenHash" TEXT,
    "userId" TEXT,
    "campaignId" TEXT,
    "guestName" TEXT,
    "guestContact" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "locale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdLandingRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdLandingRegistration_landingKey_userId_key" ON "AdLandingRegistration"("landingKey", "userId");

-- CreateIndex
CREATE INDEX "AdLandingRegistration_landingKey_createdAt_idx" ON "AdLandingRegistration"("landingKey", "createdAt");

-- CreateIndex
CREATE INDEX "AdLandingRegistration_campaignId_idx" ON "AdLandingRegistration"("campaignId");

-- AddForeignKey
ALTER TABLE "AdLandingRegistration" ADD CONSTRAINT "AdLandingRegistration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdLandingRegistration" ADD CONSTRAINT "AdLandingRegistration_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
