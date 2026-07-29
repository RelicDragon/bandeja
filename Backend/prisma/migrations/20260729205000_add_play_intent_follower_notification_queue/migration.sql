CREATE TABLE "PlayIntentFollowerNotificationJob" (
    "id" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayIntentFollowerNotificationJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlayIntentFollowerNotificationJob_intentId_key"
ON "PlayIntentFollowerNotificationJob"("intentId");

CREATE INDEX "PlayIntentFollowerNotificationJob_status_runAfter_idx"
ON "PlayIntentFollowerNotificationJob"("status", "runAfter");

CREATE INDEX "PlayIntentFollowerNotificationJob_userId_cityId_deliveredAt_idx"
ON "PlayIntentFollowerNotificationJob"("userId", "cityId", "deliveredAt");

ALTER TABLE "PlayIntentFollowerNotificationJob"
ADD CONSTRAINT "PlayIntentFollowerNotificationJob_intentId_fkey"
FOREIGN KEY ("intentId") REFERENCES "PlayIntent"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
