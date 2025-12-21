-- CreateTable
CREATE TABLE "GameFaq" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameFaq_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameFaq_gameId_idx" ON "GameFaq"("gameId");

-- CreateIndex
CREATE INDEX "GameFaq_order_idx" ON "GameFaq"("order");

-- AddForeignKey
ALTER TABLE "GameFaq" ADD CONSTRAINT "GameFaq_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
