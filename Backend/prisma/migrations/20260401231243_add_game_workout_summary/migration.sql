-- CreateEnum
CREATE TYPE "WorkoutSessionSource" AS ENUM ('APPLE_WATCH', 'ANDROID_HEALTH_CONNECT');

-- CreateTable
CREATE TABLE "GameWorkoutSummary" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "WorkoutSessionSource" NOT NULL DEFAULT 'APPLE_WATCH',
    "durationSeconds" INTEGER NOT NULL,
    "totalEnergyKcal" DOUBLE PRECISION,
    "avgHeartRate" DOUBLE PRECISION,
    "maxHeartRate" DOUBLE PRECISION,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "healthExternalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameWorkoutSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameWorkoutSummary_userId_endedAt_idx" ON "GameWorkoutSummary"("userId", "endedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GameWorkoutSummary_gameId_userId_key" ON "GameWorkoutSummary"("gameId", "userId");

-- AddForeignKey
ALTER TABLE "GameWorkoutSummary" ADD CONSTRAINT "GameWorkoutSummary_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameWorkoutSummary" ADD CONSTRAINT "GameWorkoutSummary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
