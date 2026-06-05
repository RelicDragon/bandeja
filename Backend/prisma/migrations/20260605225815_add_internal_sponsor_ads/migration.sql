-- CreateEnum
CREATE TYPE "AdCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "AdPlacementKey" AS ENUM ('home_hero', 'find_top', 'leaderboard_banner');

-- CreateEnum
CREATE TYPE "AdClickAction" AS ENUM ('OPEN_URL', 'IN_APP_ROUTE', 'CLUB_PAGE', 'MARKET_ITEM');

-- CreateEnum
CREATE TYPE "AdEventType" AS ENUM ('IMPRESSION', 'CLICK', 'DISMISS');

-- CreateTable
CREATE TABLE "AdSponsor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactEmail" TEXT,
    "notes" TEXT,
    "clubId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdSponsor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdCampaign" (
    "id" TEXT NOT NULL,
    "sponsorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AdCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "weight" INTEGER NOT NULL DEFAULT 100,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "defaultLocale" TEXT NOT NULL DEFAULT 'en',
    "frequencyCap" JSONB,
    "dismissible" BOOLEAN NOT NULL DEFAULT true,
    "dismissSnoozeDays" INTEGER,
    "clickUrlTrusted" BOOLEAN NOT NULL DEFAULT true,
    "disclosureLabel" TEXT,
    "hideDisclosure" BOOLEAN NOT NULL DEFAULT false,
    "targeting" JSONB NOT NULL,
    "testUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdCreative" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "placement" "AdPlacementKey",
    "locale" TEXT NOT NULL,
    "variantKey" TEXT NOT NULL DEFAULT 'A',
    "imageUrl" TEXT NOT NULL,
    "imageUrlDark" TEXT,
    "title" TEXT,
    "subtitle" TEXT,
    "ctaLabel" TEXT,
    "clickUrl" TEXT NOT NULL,
    "clickAction" "AdClickAction" NOT NULL DEFAULT 'OPEN_URL',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdCreative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdCampaignPlacement" (
    "campaignId" TEXT NOT NULL,
    "placement" "AdPlacementKey" NOT NULL,

    CONSTRAINT "AdCampaignPlacement_pkey" PRIMARY KEY ("campaignId","placement")
);

-- CreateTable
CREATE TABLE "AdEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" "AdEventType" NOT NULL,
    "campaignId" TEXT NOT NULL,
    "creativeId" TEXT NOT NULL,
    "placement" "AdPlacementKey" NOT NULL,
    "userId" TEXT,
    "adSessionId" TEXT,
    "platform" TEXT,
    "cityId" TEXT,
    "sport" "Sport",
    "locale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdUserState" (
    "userId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "capWindowStart" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "snoozedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdUserState_pkey" PRIMARY KEY ("userId","campaignId")
);

-- CreateTable
CREATE TABLE "AdSessionPick" (
    "adSessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "placement" "AdPlacementKey" NOT NULL,
    "contextKey" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "creativeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AdCampaignDailyStats" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "sponsorId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "placement" "AdPlacementKey" NOT NULL,
    "cityId" TEXT,
    "locale" TEXT,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "uniqueUsers" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "dismisses" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AdCampaignDailyStats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdSponsor_clubId_idx" ON "AdSponsor"("clubId");

-- CreateIndex
CREATE INDEX "AdCampaign_sponsorId_idx" ON "AdCampaign"("sponsorId");

-- CreateIndex
CREATE INDEX "AdCampaign_status_idx" ON "AdCampaign"("status");

-- CreateIndex
CREATE INDEX "AdCampaign_startsAt_idx" ON "AdCampaign"("startsAt");

-- CreateIndex
CREATE INDEX "AdCampaign_endsAt_idx" ON "AdCampaign"("endsAt");

-- CreateIndex
CREATE INDEX "AdCreative_campaignId_idx" ON "AdCreative"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "AdCreative_campaignId_placement_locale_variantKey_key" ON "AdCreative"("campaignId", "placement", "locale", "variantKey");

-- CreateIndex
CREATE UNIQUE INDEX "AdEvent_eventId_key" ON "AdEvent"("eventId");

-- CreateIndex
CREATE INDEX "AdEvent_campaignId_type_createdAt_idx" ON "AdEvent"("campaignId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "AdEvent_placement_createdAt_idx" ON "AdEvent"("placement", "createdAt");

-- CreateIndex
CREATE INDEX "AdEvent_createdAt_idx" ON "AdEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AdUserState_campaignId_idx" ON "AdUserState"("campaignId");

-- CreateIndex
CREATE INDEX "AdSessionPick_userId_idx" ON "AdSessionPick"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AdSessionPick_adSessionId_userId_placement_contextKey_key" ON "AdSessionPick"("adSessionId", "userId", "placement", "contextKey");

-- CreateIndex
CREATE INDEX "AdCampaignDailyStats_sponsorId_date_idx" ON "AdCampaignDailyStats"("sponsorId", "date");

-- CreateIndex
CREATE INDEX "AdCampaignDailyStats_campaignId_date_idx" ON "AdCampaignDailyStats"("campaignId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AdCampaignDailyStats_campaignId_date_placement_cityId_local_key" ON "AdCampaignDailyStats"("campaignId", "date", "placement", "cityId", "locale");

-- AddForeignKey
ALTER TABLE "AdSponsor" ADD CONSTRAINT "AdSponsor_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "AdSponsor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCreative" ADD CONSTRAINT "AdCreative_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaignPlacement" ADD CONSTRAINT "AdCampaignPlacement_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdEvent" ADD CONSTRAINT "AdEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdUserState" ADD CONSTRAINT "AdUserState_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdSessionPick" ADD CONSTRAINT "AdSessionPick_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaignDailyStats" ADD CONSTRAINT "AdCampaignDailyStats_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
