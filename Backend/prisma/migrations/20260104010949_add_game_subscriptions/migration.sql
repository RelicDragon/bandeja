-- CreateTable
CREATE TABLE "GameSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "clubIds" TEXT[],
    "entityTypes" "EntityType"[],
    "dayOfWeek" INTEGER[],
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "minLevel" DOUBLE PRECISION,
    "maxLevel" DOUBLE PRECISION,
    "myGenderOnly" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameSubscription_userId_idx" ON "GameSubscription"("userId");

-- CreateIndex
CREATE INDEX "GameSubscription_cityId_idx" ON "GameSubscription"("cityId");

-- CreateIndex
CREATE INDEX "GameSubscription_isActive_idx" ON "GameSubscription"("isActive");

-- AddForeignKey
ALTER TABLE "GameSubscription" ADD CONSTRAINT "GameSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameSubscription" ADD CONSTRAINT "GameSubscription_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;
