-- CreateTable
CREATE TABLE "UserAchievementStats" (
    "userId" TEXT NOT NULL,
    "organizedGames" INTEGER NOT NULL DEFAULT 0,
    "organizedTournaments" INTEGER NOT NULL DEFAULT 0,
    "organizedBars" INTEGER NOT NULL DEFAULT 0,
    "giantKillerWins" INTEGER NOT NULL DEFAULT 0,
    "dynamicDuoMaxWins" INTEGER NOT NULL DEFAULT 0,
    "openCourtPartners" INTEGER NOT NULL DEFAULT 0,
    "organizeRefreshedAt" TIMESTAMP(3),
    "partnerRefreshedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAchievementStats_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "UserAchievementStats" ADD CONSTRAINT "UserAchievementStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
