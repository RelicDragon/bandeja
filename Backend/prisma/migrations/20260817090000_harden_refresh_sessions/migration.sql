ALTER TABLE "user_refresh_sessions"
ADD COLUMN "rotationRequestId" TEXT,
ADD COLUMN "replacementTokenCiphertext" TEXT;

CREATE INDEX "user_refresh_sessions_expiresAt_idx"
ON "user_refresh_sessions"("expiresAt");

CREATE TABLE "auth_refresh_events" (
    "id" TEXT NOT NULL,
    "outcome" VARCHAR(48) NOT NULL,
    "platform" VARCHAR(16) NOT NULL,
    "clientVersion" VARCHAR(32),
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_refresh_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "auth_refresh_events_createdAt_idx"
ON "auth_refresh_events"("createdAt");

CREATE INDEX "auth_refresh_events_outcome_createdAt_idx"
ON "auth_refresh_events"("outcome", "createdAt");

CREATE INDEX "auth_refresh_events_platform_createdAt_idx"
ON "auth_refresh_events"("platform", "createdAt");
