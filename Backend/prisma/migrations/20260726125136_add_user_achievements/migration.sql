-- CreateTable
CREATE TABLE "UserAchievement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sport" "Sport",
    "place" INTEGER,
    "sourceEntityType" "EntityType",
    "sourceEntityId" TEXT,
    "sourceGameId" TEXT,
    "sourceKey" TEXT NOT NULL DEFAULT '',
    "revokedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAchievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAchievementPin" (
    "userId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "achievementId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAchievementPin_pkey" PRIMARY KEY ("userId","slot")
);

-- CreateIndex
CREATE INDEX "UserAchievement_userId_isActive_idx" ON "UserAchievement"("userId", "isActive");

-- CreateIndex
CREATE INDEX "UserAchievement_sourceEntityId_definitionId_idx" ON "UserAchievement"("sourceEntityId", "definitionId");

-- CreateIndex
CREATE INDEX "UserAchievement_sourceGameId_idx" ON "UserAchievement"("sourceGameId");

-- CreateIndex
CREATE UNIQUE INDEX "UserAchievement_userId_definitionId_sourceKey_key" ON "UserAchievement"("userId", "definitionId", "sourceKey");

-- CreateIndex
CREATE INDEX "UserAchievementPin_achievementId_idx" ON "UserAchievementPin"("achievementId");

-- CreateIndex
CREATE UNIQUE INDEX "UserAchievementPin_userId_achievementId_key" ON "UserAchievementPin"("userId", "achievementId");

-- AddForeignKey
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAchievementPin" ADD CONSTRAINT "UserAchievementPin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAchievementPin" ADD CONSTRAINT "UserAchievementPin_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "UserAchievement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
