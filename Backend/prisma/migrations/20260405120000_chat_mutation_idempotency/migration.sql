-- CreateTable
CREATE TABLE "ChatMutationIdempotency" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientMutationId" VARCHAR(128) NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "messageId" VARCHAR(40) NOT NULL,
    "payloadHash" VARCHAR(64),
    "responseJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMutationIdempotency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatMutationIdempotency_userId_clientMutationId_key" ON "ChatMutationIdempotency"("userId", "clientMutationId");

-- CreateIndex
CREATE INDEX "ChatMutationIdempotency_userId_createdAt_idx" ON "ChatMutationIdempotency"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ChatMutationIdempotency" ADD CONSTRAINT "ChatMutationIdempotency_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
