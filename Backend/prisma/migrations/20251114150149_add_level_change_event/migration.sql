-- CreateEnum
CREATE TYPE "LevelChangeEventType" AS ENUM ('GAME', 'LUNDA', 'SET', 'OTHER');

-- CreateTable
CREATE TABLE "LevelChangeEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "levelBefore" DOUBLE PRECISION NOT NULL,
    "levelAfter" DOUBLE PRECISION NOT NULL,
    "eventType" "LevelChangeEventType" NOT NULL,
    "gameId" TEXT,
    "linkEntityType" "EntityType",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LevelChangeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LevelChangeEvent_userId_idx" ON "LevelChangeEvent"("userId");

-- CreateIndex
CREATE INDEX "LevelChangeEvent_gameId_idx" ON "LevelChangeEvent"("gameId");

-- CreateIndex
CREATE INDEX "LevelChangeEvent_eventType_idx" ON "LevelChangeEvent"("eventType");

-- CreateIndex
CREATE INDEX "LevelChangeEvent_createdAt_idx" ON "LevelChangeEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "LevelChangeEvent" ADD CONSTRAINT "LevelChangeEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LevelChangeEvent" ADD CONSTRAINT "LevelChangeEvent_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;
