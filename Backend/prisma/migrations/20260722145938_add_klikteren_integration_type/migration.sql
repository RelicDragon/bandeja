-- AlterEnum
ALTER TYPE "ClubIntegrationType" ADD VALUE 'KLIKTEREN';

-- CreateTable
CREATE TABLE "UserClubKlikterenAuth" (
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

    CONSTRAINT "UserClubKlikterenAuth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubKlikterenBusySnapshot" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "courtId" TEXT,
    "externalCourtId" TEXT,
    "externalCourtName" TEXT,
    "date" TEXT NOT NULL,
    "busySlots" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubKlikterenBusySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserClubKlikterenAuth_clubId_idx" ON "UserClubKlikterenAuth"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "UserClubKlikterenAuth_userId_clubId_key" ON "UserClubKlikterenAuth"("userId", "clubId");

-- CreateIndex
CREATE INDEX "ClubKlikterenBusySnapshot_clubId_date_idx" ON "ClubKlikterenBusySnapshot"("clubId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ClubKlikterenBusySnapshot_clubId_courtId_date_key" ON "ClubKlikterenBusySnapshot"("clubId", "courtId", "date");

-- AddForeignKey
ALTER TABLE "UserClubKlikterenAuth" ADD CONSTRAINT "UserClubKlikterenAuth_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserClubKlikterenAuth" ADD CONSTRAINT "UserClubKlikterenAuth_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubKlikterenBusySnapshot" ADD CONSTRAINT "ClubKlikterenBusySnapshot_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubKlikterenBusySnapshot" ADD CONSTRAINT "ClubKlikterenBusySnapshot_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE SET NULL ON UPDATE CASCADE;
