CREATE TYPE "PlayIntentJobStatus" AS ENUM (
    'pending',
    'running',
    'done',
    'failed',
    'skipped'
);

CREATE TYPE "PlayIntentMatchJobKind" AS ENUM (
    'INTENT_CREATED',
    'PUBLIC_GAME_CREATED'
);

ALTER TABLE "PlayIntentFollowerNotificationJob"
ALTER COLUMN "status" DROP DEFAULT,
ALTER COLUMN "status" TYPE "PlayIntentJobStatus"
USING ("status"::"PlayIntentJobStatus"),
ALTER COLUMN "status" SET DEFAULT 'pending';

CREATE TABLE "PlayIntentMatchJob" (
    "id" TEXT NOT NULL,
    "kind" "PlayIntentMatchJobKind" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "creatorId" TEXT,
    "status" "PlayIntentJobStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayIntentMatchJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlayIntentNotificationDelivery" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "notificationType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelType" "NotificationChannelType" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "PlayIntentJobStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayIntentNotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlayIntentMatchJob_kind_sourceId_key"
ON "PlayIntentMatchJob"("kind", "sourceId");

CREATE INDEX "PlayIntentMatchJob_status_runAfter_idx"
ON "PlayIntentMatchJob"("status", "runAfter");

CREATE UNIQUE INDEX "PlayIntentNotificationDelivery_eventKey_userId_channelType_key"
ON "PlayIntentNotificationDelivery"("eventKey", "userId", "channelType");

CREATE INDEX "PlayIntentNotificationDelivery_status_runAfter_idx"
ON "PlayIntentNotificationDelivery"("status", "runAfter");

CREATE INDEX "PlayIntentNotificationDelivery_userId_createdAt_idx"
ON "PlayIntentNotificationDelivery"("userId", "createdAt");

CREATE INDEX "PlayIntentNotificationDelivery_notificationType_sourceId_idx"
ON "PlayIntentNotificationDelivery"("notificationType", "sourceId");

ALTER TABLE "PlayIntentNotificationDelivery"
ADD CONSTRAINT "PlayIntentNotificationDelivery_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
