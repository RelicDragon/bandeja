-- AlterEnum
ALTER TYPE "ClubIntegrationType" ADD VALUE 'NSPADELSUPABASE';

-- CreateTable
CREATE TABLE "UserClubNspadelAuth" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "email" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "scoutOptIn" BOOLEAN NOT NULL DEFAULT true,
    "scoutInvalidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserClubNspadelAuth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubNspadelBusySnapshot" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "courtId" TEXT,
    "externalCourtId" TEXT,
    "externalCourtName" TEXT,
    "date" TEXT NOT NULL,
    "busySlots" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubNspadelBusySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserClubNspadelAuth_clubId_idx" ON "UserClubNspadelAuth"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "UserClubNspadelAuth_userId_clubId_key" ON "UserClubNspadelAuth"("userId", "clubId");

-- CreateIndex
CREATE INDEX "ClubNspadelBusySnapshot_clubId_date_idx" ON "ClubNspadelBusySnapshot"("clubId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ClubNspadelBusySnapshot_clubId_courtId_date_key" ON "ClubNspadelBusySnapshot"("clubId", "courtId", "date");

-- AddForeignKey
ALTER TABLE "UserClubNspadelAuth" ADD CONSTRAINT "UserClubNspadelAuth_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserClubNspadelAuth" ADD CONSTRAINT "UserClubNspadelAuth_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubNspadelBusySnapshot" ADD CONSTRAINT "ClubNspadelBusySnapshot_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubNspadelBusySnapshot" ADD CONSTRAINT "ClubNspadelBusySnapshot_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE SET NULL ON UPDATE CASCADE;
