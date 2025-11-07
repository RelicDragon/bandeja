-- CreateTable
CREATE TABLE "GameCourt" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameCourt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameCourt_gameId_idx" ON "GameCourt"("gameId");

-- CreateIndex
CREATE INDEX "GameCourt_courtId_idx" ON "GameCourt"("courtId");

-- CreateIndex
CREATE UNIQUE INDEX "GameCourt_gameId_courtId_key" ON "GameCourt"("gameId", "courtId");

-- CreateIndex
CREATE UNIQUE INDEX "GameCourt_gameId_order_key" ON "GameCourt"("gameId", "order");

-- AddForeignKey
ALTER TABLE "GameCourt" ADD CONSTRAINT "GameCourt_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameCourt" ADD CONSTRAINT "GameCourt_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE CASCADE ON UPDATE CASCADE;
