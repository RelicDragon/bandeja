-- CreateIndex
CREATE INDEX "GameSubscription_userId_isActive_cityId_idx" ON "GameSubscription"("userId", "isActive", "cityId");
