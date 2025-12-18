-- CreateTable
CREATE TABLE "DeletedUser" (
    "id" TEXT NOT NULL,
    "originalUserId" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "telegramId" TEXT,
    "telegramUsername" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "avatar" TEXT,
    "originalAvatar" TEXT,
    "passwordHash" TEXT,
    "currentCityId" TEXT,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeletedUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeletedUser_originalUserId_idx" ON "DeletedUser"("originalUserId");

-- CreateIndex
CREATE INDEX "DeletedUser_deletedAt_idx" ON "DeletedUser"("deletedAt");
