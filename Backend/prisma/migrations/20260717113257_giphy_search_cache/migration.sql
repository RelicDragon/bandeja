-- CreateTable
CREATE TABLE "GiphySearchCache" (
    "key" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiphySearchCache_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "GiphySearchCache_expiresAt_idx" ON "GiphySearchCache"("expiresAt");
