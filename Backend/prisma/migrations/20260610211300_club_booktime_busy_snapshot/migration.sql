-- CreateTable
CREATE TABLE "UserClubBooktimeAuth" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "scoutOptIn" BOOLEAN NOT NULL DEFAULT true,
    "scoutInvalidAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserClubBooktimeAuth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubBooktimeBusySnapshot" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "courtId" TEXT,
    "externalCourtId" TEXT,
    "externalCourtName" TEXT,
    "date" TEXT NOT NULL,
    "busySlots" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubBooktimeBusySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserClubBooktimeAuth_clubId_scoutOptIn_idx" ON "UserClubBooktimeAuth"("clubId", "scoutOptIn");

-- CreateIndex
CREATE UNIQUE INDEX "UserClubBooktimeAuth_userId_clubId_key" ON "UserClubBooktimeAuth"("userId", "clubId");

-- CreateIndex
CREATE INDEX "ClubBooktimeBusySnapshot_clubId_date_idx" ON "ClubBooktimeBusySnapshot"("clubId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ClubBooktimeBusySnapshot_clubId_courtId_date_key" ON "ClubBooktimeBusySnapshot"("clubId", "courtId", "date");

-- AddForeignKey
ALTER TABLE "UserClubBooktimeAuth" ADD CONSTRAINT "UserClubBooktimeAuth_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserClubBooktimeAuth" ADD CONSTRAINT "UserClubBooktimeAuth_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubBooktimeBusySnapshot" ADD CONSTRAINT "ClubBooktimeBusySnapshot_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubBooktimeBusySnapshot" ADD CONSTRAINT "ClubBooktimeBusySnapshot_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE SET NULL ON UPDATE CASCADE;
