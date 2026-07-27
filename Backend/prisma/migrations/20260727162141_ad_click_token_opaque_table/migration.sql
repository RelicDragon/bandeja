-- CreateTable
CREATE TABLE "AdClickToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdClickToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdClickToken_token_key" ON "AdClickToken"("token");

-- CreateIndex
CREATE INDEX "AdClickToken_campaignId_idx" ON "AdClickToken"("campaignId");

-- CreateIndex
CREATE INDEX "AdClickToken_expiresAt_idx" ON "AdClickToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdClickToken_userId_campaignId_key" ON "AdClickToken"("userId", "campaignId");

-- AddForeignKey
ALTER TABLE "AdClickToken" ADD CONSTRAINT "AdClickToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdClickToken" ADD CONSTRAINT "AdClickToken_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
