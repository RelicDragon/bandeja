-- CreateTable
CREATE TABLE "LinkToAppEvent" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "userAgent" TEXT,
    "referer" TEXT,
    "platform" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkToAppEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LinkToAppEvent_createdAt_idx" ON "LinkToAppEvent"("createdAt");

-- CreateIndex
CREATE INDEX "LinkToAppEvent_kind_createdAt_idx" ON "LinkToAppEvent"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "LinkToAppEvent_utmCampaign_kind_createdAt_idx" ON "LinkToAppEvent"("utmCampaign", "kind", "createdAt");
