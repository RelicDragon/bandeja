-- CreateTable
CREATE TABLE "JoinQueue" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JoinQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JoinQueue_userId_idx" ON "JoinQueue"("userId");

-- CreateIndex
CREATE INDEX "JoinQueue_gameId_idx" ON "JoinQueue"("gameId");

-- CreateIndex
CREATE INDEX "JoinQueue_status_idx" ON "JoinQueue"("status");

-- CreateIndex
CREATE UNIQUE INDEX "JoinQueue_userId_gameId_key" ON "JoinQueue"("userId", "gameId");

-- AddForeignKey
ALTER TABLE "JoinQueue" ADD CONSTRAINT "JoinQueue_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JoinQueue" ADD CONSTRAINT "JoinQueue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
