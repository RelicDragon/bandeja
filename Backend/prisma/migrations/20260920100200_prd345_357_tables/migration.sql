-- CreateTable
CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "GameSeries" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "cadence" "GameSeriesCadence" NOT NULL DEFAULT 'WEEKLY',
    "weekday" INTEGER NOT NULL,
    "startTimeLocal" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "clubId" TEXT,
    "courtIds" TEXT[],
    "template" JSONB NOT NULL,
    "horizonDays" INTEGER NOT NULL DEFAULT 14,
    "seatDeadlineHours" INTEGER NOT NULL DEFAULT 48,
    "endsOn" DATE,
    "status" "GameSeriesStatus" NOT NULL DEFAULT 'ACTIVE',
    "groupChannelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameSeriesRegular" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "GameSeriesRegular_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameSeriesSkip" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "occurrenceDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameSeriesSkip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameCostShare" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "markedPaidAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "method" "CostShareMethod" NOT NULL DEFAULT 'MANUAL',
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameCostShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PairStat" (
    "id" TEXT NOT NULL,
    "sport" "Sport" NOT NULL,
    "cityId" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "games" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "lastPlayedAt" TIMESTAMP(3),
    "combinedLevel" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PairStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyRecap" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "viewedAt" TIMESTAMP(3),
    "sharedAt" TIMESTAMP(3),
    "sharedSlideKeys" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyRecap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralReward" (
    "id" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "referrerUserId" TEXT NOT NULL,
    "rewardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referrerTxId" TEXT,
    "referredTxId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserGoods" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goodsId" TEXT NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "giftedByUserId" TEXT,
    "equipped" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserGoods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpotOpenedDelivery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "kind" "SpotOpenedKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpotOpenedDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveGameNotifyDelivery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveGameNotifyDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameSeries_ownerId_idx" ON "GameSeries"("ownerId");

-- CreateIndex
CREATE INDEX "GameSeries_clubId_idx" ON "GameSeries"("clubId");

-- CreateIndex
CREATE INDEX "GameSeries_groupChannelId_idx" ON "GameSeries"("groupChannelId");

-- CreateIndex
CREATE INDEX "GameSeries_status_idx" ON "GameSeries"("status");

-- CreateIndex
CREATE UNIQUE INDEX "GameSeriesRegular_seriesId_userId_key" ON "GameSeriesRegular"("seriesId", "userId");

-- CreateIndex
CREATE INDEX "GameSeriesRegular_seriesId_idx" ON "GameSeriesRegular"("seriesId");

-- CreateIndex
CREATE INDEX "GameSeriesRegular_userId_idx" ON "GameSeriesRegular"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GameSeriesSkip_seriesId_occurrenceDate_key" ON "GameSeriesSkip"("seriesId", "occurrenceDate");

-- CreateIndex
CREATE INDEX "GameSeriesSkip_seriesId_idx" ON "GameSeriesSkip"("seriesId");

-- CreateIndex
CREATE UNIQUE INDEX "GameCostShare_gameId_userId_key" ON "GameCostShare"("gameId", "userId");

-- CreateIndex
CREATE INDEX "GameCostShare_gameId_idx" ON "GameCostShare"("gameId");

-- CreateIndex
CREATE INDEX "GameCostShare_userId_idx" ON "GameCostShare"("userId");

-- CreateIndex
CREATE INDEX "GameCostShare_transactionId_idx" ON "GameCostShare"("transactionId");

-- CreateIndex
CREATE INDEX "GameCostShare_userId_confirmedAt_idx" ON "GameCostShare"("userId", "confirmedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PairStat_sport_cityId_userAId_userBId_key" ON "PairStat"("sport", "cityId", "userAId", "userBId");

-- CreateIndex
CREATE INDEX "PairStat_cityId_idx" ON "PairStat"("cityId");

-- CreateIndex
CREATE INDEX "PairStat_userAId_idx" ON "PairStat"("userAId");

-- CreateIndex
CREATE INDEX "PairStat_userBId_idx" ON "PairStat"("userBId");

-- CreateIndex
CREATE INDEX "PairStat_sport_cityId_games_idx" ON "PairStat"("sport", "cityId", "games");

-- CreateIndex
CREATE INDEX "PairStat_sport_cityId_lastPlayedAt_idx" ON "PairStat"("sport", "cityId", "lastPlayedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyRecap_userId_monthKey_key" ON "MonthlyRecap"("userId", "monthKey");

-- CreateIndex
CREATE INDEX "MonthlyRecap_userId_idx" ON "MonthlyRecap"("userId");

-- CreateIndex
CREATE INDEX "MonthlyRecap_monthKey_idx" ON "MonthlyRecap"("monthKey");

-- CreateIndex
CREATE INDEX "MonthlyRecap_createdAt_idx" ON "MonthlyRecap"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralReward_referredUserId_key" ON "ReferralReward"("referredUserId");

-- CreateIndex
CREATE INDEX "ReferralReward_referrerUserId_idx" ON "ReferralReward"("referrerUserId");

-- CreateIndex
CREATE INDEX "ReferralReward_referrerTxId_idx" ON "ReferralReward"("referrerTxId");

-- CreateIndex
CREATE INDEX "ReferralReward_referredTxId_idx" ON "ReferralReward"("referredTxId");

-- CreateIndex
CREATE INDEX "ReferralReward_rewardedAt_idx" ON "ReferralReward"("rewardedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserGoods_userId_goodsId_key" ON "UserGoods"("userId", "goodsId");

-- CreateIndex
CREATE INDEX "UserGoods_userId_idx" ON "UserGoods"("userId");

-- CreateIndex
CREATE INDEX "UserGoods_goodsId_idx" ON "UserGoods"("goodsId");

-- CreateIndex
CREATE INDEX "UserGoods_giftedByUserId_idx" ON "UserGoods"("giftedByUserId");

-- CreateIndex
CREATE INDEX "UserGoods_userId_equipped_idx" ON "UserGoods"("userId", "equipped");

-- CreateIndex
CREATE UNIQUE INDEX "SpotOpenedDelivery_userId_gameId_dayKey_kind_key" ON "SpotOpenedDelivery"("userId", "gameId", "dayKey", "kind");

-- CreateIndex
CREATE INDEX "SpotOpenedDelivery_userId_idx" ON "SpotOpenedDelivery"("userId");

-- CreateIndex
CREATE INDEX "SpotOpenedDelivery_gameId_idx" ON "SpotOpenedDelivery"("gameId");

-- CreateIndex
CREATE INDEX "SpotOpenedDelivery_createdAt_idx" ON "SpotOpenedDelivery"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LiveGameNotifyDelivery_userId_gameId_key" ON "LiveGameNotifyDelivery"("userId", "gameId");

-- CreateIndex
CREATE INDEX "LiveGameNotifyDelivery_userId_idx" ON "LiveGameNotifyDelivery"("userId");

-- CreateIndex
CREATE INDEX "LiveGameNotifyDelivery_gameId_idx" ON "LiveGameNotifyDelivery"("gameId");

-- CreateIndex
CREATE INDEX "LiveGameNotifyDelivery_createdAt_idx" ON "LiveGameNotifyDelivery"("createdAt");

-- AddForeignKey
ALTER TABLE "GameSeries" ADD CONSTRAINT "GameSeries_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameSeries" ADD CONSTRAINT "GameSeries_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameSeries" ADD CONSTRAINT "GameSeries_groupChannelId_fkey" FOREIGN KEY ("groupChannelId") REFERENCES "GroupChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameSeriesRegular" ADD CONSTRAINT "GameSeriesRegular_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "GameSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameSeriesRegular" ADD CONSTRAINT "GameSeriesRegular_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameSeriesSkip" ADD CONSTRAINT "GameSeriesSkip_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "GameSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameCostShare" ADD CONSTRAINT "GameCostShare_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameCostShare" ADD CONSTRAINT "GameCostShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameCostShare" ADD CONSTRAINT "GameCostShare_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PairStat" ADD CONSTRAINT "PairStat_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PairStat" ADD CONSTRAINT "PairStat_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PairStat" ADD CONSTRAINT "PairStat_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyRecap" ADD CONSTRAINT "MonthlyRecap_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_referrerUserId_fkey" FOREIGN KEY ("referrerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_referrerTxId_fkey" FOREIGN KEY ("referrerTxId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_referredTxId_fkey" FOREIGN KEY ("referredTxId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGoods" ADD CONSTRAINT "UserGoods_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGoods" ADD CONSTRAINT "UserGoods_goodsId_fkey" FOREIGN KEY ("goodsId") REFERENCES "Goods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGoods" ADD CONSTRAINT "UserGoods_giftedByUserId_fkey" FOREIGN KEY ("giftedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpotOpenedDelivery" ADD CONSTRAINT "SpotOpenedDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpotOpenedDelivery" ADD CONSTRAINT "SpotOpenedDelivery_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveGameNotifyDelivery" ADD CONSTRAINT "LiveGameNotifyDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveGameNotifyDelivery" ADD CONSTRAINT "LiveGameNotifyDelivery_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
