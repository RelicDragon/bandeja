-- CreateTable
CREATE TABLE "LinkToAppAttribution" (
    "id" TEXT NOT NULL,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "lastChoice" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "convertedUserId" TEXT,
    "convertedAt" TIMESTAMP(3),
    "convertedAuthKind" TEXT,

    CONSTRAINT "LinkToAppAttribution_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "User" ADD COLUMN "attributionId" TEXT,
ADD COLUMN "utmSource" TEXT,
ADD COLUMN "utmMedium" TEXT,
ADD COLUMN "utmCampaign" TEXT,
ADD COLUMN "utmContent" TEXT,
ADD COLUMN "utmTerm" TEXT,
ADD COLUMN "attributedAt" TIMESTAMP(3),
ADD COLUMN "attributionChoice" TEXT,
ADD COLUMN "attributionAuthKind" TEXT;

-- AlterTable
ALTER TABLE "LinkToAppEvent" ADD COLUMN "attributionId" TEXT,
ADD COLUMN "userId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "LinkToAppAttribution_convertedUserId_key" ON "LinkToAppAttribution"("convertedUserId");

-- CreateIndex
CREATE INDEX "LinkToAppAttribution_utmCampaign_createdAt_idx" ON "LinkToAppAttribution"("utmCampaign", "createdAt");

-- CreateIndex
CREATE INDEX "LinkToAppAttribution_convertedAt_idx" ON "LinkToAppAttribution"("convertedAt");

-- CreateIndex
CREATE INDEX "User_attributionId_idx" ON "User"("attributionId");

-- CreateIndex
CREATE INDEX "User_utmCampaign_idx" ON "User"("utmCampaign");

-- CreateIndex
CREATE INDEX "LinkToAppEvent_attributionId_createdAt_idx" ON "LinkToAppEvent"("attributionId", "createdAt");

-- CreateIndex
CREATE INDEX "LinkToAppEvent_userId_createdAt_idx" ON "LinkToAppEvent"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "LinkToAppAttribution" ADD CONSTRAINT "LinkToAppAttribution_convertedUserId_fkey" FOREIGN KEY ("convertedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_attributionId_fkey" FOREIGN KEY ("attributionId") REFERENCES "LinkToAppAttribution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkToAppEvent" ADD CONSTRAINT "LinkToAppEvent_attributionId_fkey" FOREIGN KEY ("attributionId") REFERENCES "LinkToAppAttribution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkToAppEvent" ADD CONSTRAINT "LinkToAppEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
