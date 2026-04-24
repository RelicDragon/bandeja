-- CreateTable
CREATE TABLE "user_refresh_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceLabel" TEXT,
    "platform" TEXT NOT NULL DEFAULT 'unknown',
    "userAgent" TEXT,
    "deviceId" TEXT,
    "ip" VARCHAR(64),
    "revokedAt" TIMESTAMP(3),
    "replacedBySessionId" TEXT,
    "rotationFamilyId" TEXT NOT NULL,

    CONSTRAINT "user_refresh_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_refresh_sessions_tokenHash_key" ON "user_refresh_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "user_refresh_sessions_userId_revokedAt_idx" ON "user_refresh_sessions"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "user_refresh_sessions_rotationFamilyId_idx" ON "user_refresh_sessions"("rotationFamilyId");

-- AddForeignKey
ALTER TABLE "user_refresh_sessions" ADD CONSTRAINT "user_refresh_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
