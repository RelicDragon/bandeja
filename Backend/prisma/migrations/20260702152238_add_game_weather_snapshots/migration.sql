-- CreateTable
CREATE TABLE "GameWeatherSnapshot" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'open-meteo',
    "source" TEXT NOT NULL DEFAULT 'forecast',
    "cityName" TEXT NOT NULL,
    "cityTimezone" TEXT NOT NULL,
    "gameStartTime" TIMESTAMP(3) NOT NULL,
    "gameEndTime" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" JSONB NOT NULL,
    "hours" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameWeatherSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GameWeatherSnapshot_gameId_key" ON "GameWeatherSnapshot"("gameId");

-- CreateIndex
CREATE INDEX "GameWeatherSnapshot_cityId_idx" ON "GameWeatherSnapshot"("cityId");

-- CreateIndex
CREATE INDEX "GameWeatherSnapshot_gameStartTime_idx" ON "GameWeatherSnapshot"("gameStartTime");

-- CreateIndex
CREATE INDEX "GameWeatherSnapshot_capturedAt_idx" ON "GameWeatherSnapshot"("capturedAt");

-- AddForeignKey
ALTER TABLE "GameWeatherSnapshot" ADD CONSTRAINT "GameWeatherSnapshot_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameWeatherSnapshot" ADD CONSTRAINT "GameWeatherSnapshot_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;
