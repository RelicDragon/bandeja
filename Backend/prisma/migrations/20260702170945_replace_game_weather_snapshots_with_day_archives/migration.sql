/*
  Warnings:

  - You are about to drop the `GameWeatherSnapshot` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "GameWeatherSnapshot" DROP CONSTRAINT "GameWeatherSnapshot_cityId_fkey";

-- DropForeignKey
ALTER TABLE "GameWeatherSnapshot" DROP CONSTRAINT "GameWeatherSnapshot_gameId_fkey";

-- DropTable
DROP TABLE "GameWeatherSnapshot";

-- CreateTable
CREATE TABLE "WeatherDayArchive" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'open-meteo',
    "day" TEXT NOT NULL,
    "cityTimezone" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "hours" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeatherDayArchive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WeatherDayArchive_cityId_day_idx" ON "WeatherDayArchive"("cityId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "WeatherDayArchive_cityId_provider_day_key" ON "WeatherDayArchive"("cityId", "provider", "day");

-- AddForeignKey
ALTER TABLE "WeatherDayArchive" ADD CONSTRAINT "WeatherDayArchive_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;
