-- CreateTable
CREATE TABLE "LinkToAppCampaignLabel" (
    "utmCampaign" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinkToAppCampaignLabel_pkey" PRIMARY KEY ("utmCampaign")
);
