-- CreateTable
CREATE TABLE "GameReaction" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameReaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameReaction_gameId_idx" ON "GameReaction"("gameId");

-- CreateIndex
CREATE INDEX "GameReaction_userId_idx" ON "GameReaction"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GameReaction_gameId_userId_key" ON "GameReaction"("gameId", "userId");

-- AddForeignKey
ALTER TABLE "GameReaction" ADD CONSTRAINT "GameReaction_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameReaction" ADD CONSTRAINT "GameReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
