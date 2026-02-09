-- CreateTable
CREATE TABLE "UserGameNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserGameNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserGameNote_userId_idx" ON "UserGameNote"("userId");

-- CreateIndex
CREATE INDEX "UserGameNote_gameId_idx" ON "UserGameNote"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "UserGameNote_userId_gameId_key" ON "UserGameNote"("userId", "gameId");
