CREATE TABLE IF NOT EXISTS "WeatherForecastCache" (
  "id" TEXT NOT NULL,
  "cityId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'open-meteo',
  "forecastStart" TIMESTAMP(3) NOT NULL,
  "forecastEnd" TIMESTAMP(3) NOT NULL,
  "fetchedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "payload" JSONB NOT NULL,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WeatherForecastCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WeatherForecastCache_cityId_provider_key"
ON "WeatherForecastCache"("cityId", "provider");

CREATE INDEX IF NOT EXISTS "WeatherForecastCache_cityId_idx"
ON "WeatherForecastCache"("cityId");

CREATE INDEX IF NOT EXISTS "WeatherForecastCache_expiresAt_idx"
ON "WeatherForecastCache"("expiresAt");

ALTER TABLE "WeatherForecastCache"
ADD CONSTRAINT "WeatherForecastCache_cityId_fkey"
FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;
