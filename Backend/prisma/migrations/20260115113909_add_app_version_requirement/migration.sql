-- CreateTable
CREATE TABLE "AppVersionRequirement" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "minBuildNumber" INTEGER NOT NULL,
    "minVersion" TEXT NOT NULL,
    "isBlocking" BOOLEAN NOT NULL DEFAULT false,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppVersionRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppVersionRequirement_platform_key" ON "AppVersionRequirement"("platform");

-- CreateIndex
CREATE INDEX "AppVersionRequirement_platform_idx" ON "AppVersionRequirement"("platform");
