-- AlterEnum
ALTER TYPE "ClubIntegrationType" ADD VALUE 'PADELOO';

-- CreateTable
CREATE TABLE "UserClubPadelooAuth" (
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

    CONSTRAINT "UserClubPadelooAuth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubPadelooBusySnapshot" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "courtId" TEXT,
    "externalCourtId" TEXT,
    "externalCourtName" TEXT,
    "date" TEXT NOT NULL,
    "busySlots" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubPadelooBusySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserClubPadelooAuth_clubId_idx" ON "UserClubPadelooAuth"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "UserClubPadelooAuth_userId_clubId_key" ON "UserClubPadelooAuth"("userId", "clubId");

-- CreateIndex
CREATE INDEX "ClubPadelooBusySnapshot_clubId_date_idx" ON "ClubPadelooBusySnapshot"("clubId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ClubPadelooBusySnapshot_clubId_courtId_date_key" ON "ClubPadelooBusySnapshot"("clubId", "courtId", "date");

-- AddForeignKey
ALTER TABLE "UserClubPadelooAuth" ADD CONSTRAINT "UserClubPadelooAuth_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserClubPadelooAuth" ADD CONSTRAINT "UserClubPadelooAuth_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubPadelooBusySnapshot" ADD CONSTRAINT "ClubPadelooBusySnapshot_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubPadelooBusySnapshot" ADD CONSTRAINT "ClubPadelooBusySnapshot_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE SET NULL ON UPDATE CASCADE;
