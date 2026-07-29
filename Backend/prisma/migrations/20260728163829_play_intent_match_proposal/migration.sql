-- CreateEnum
CREATE TYPE "PlayIntentStatus" AS ENUM ('OPEN', 'MATCHED', 'CONSUMED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PlayIntentTimeOfDay" AS ENUM ('ANYTIME', 'MORNING', 'AFTERNOON', 'EVENING', 'CUSTOM');

-- CreateEnum
CREATE TYPE "MatchProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CONVERTED_TO_GAME');

-- CreateEnum
CREATE TYPE "MatchProposalMemberResponse" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateTable
CREATE TABLE "PlayIntent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "sport" "Sport" NOT NULL,
    "dateKeys" TEXT[],
    "timeOfDay" "PlayIntentTimeOfDay" NOT NULL DEFAULT 'ANYTIME',
    "startTime" TEXT,
    "endTime" TEXT,
    "clubIds" TEXT[],
    "minLevel" DOUBLE PRECISION,
    "maxLevel" DOUBLE PRECISION,
    "myGenderOnly" BOOLEAN NOT NULL DEFAULT false,
    "status" "PlayIntentStatus" NOT NULL DEFAULT 'OPEN',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchProposal" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "sport" "Sport" NOT NULL,
    "status" "MatchProposalStatus" NOT NULL DEFAULT 'PENDING',
    "dateKeys" TEXT[],
    "startTime" TEXT,
    "endTime" TEXT,
    "clubIds" TEXT[],
    "suggestedStartTime" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "gameId" TEXT,
    "hostUserId" TEXT,
    "rematchKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchProposalMember" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "response" "MatchProposalMemberResponse" NOT NULL DEFAULT 'PENDING',
    "isHost" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchProposalMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayIntentGameOwnerPing" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayIntentGameOwnerPing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayIntent_userId_status_idx" ON "PlayIntent"("userId", "status");

-- CreateIndex
CREATE INDEX "PlayIntent_cityId_sport_status_idx" ON "PlayIntent"("cityId", "sport", "status");

-- CreateIndex
CREATE INDEX "PlayIntent_status_expiresAt_idx" ON "PlayIntent"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "PlayIntent_cityId_sport_status_expiresAt_idx" ON "PlayIntent"("cityId", "sport", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "MatchProposal_status_expiresAt_idx" ON "MatchProposal"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "MatchProposal_rematchKey_createdAt_idx" ON "MatchProposal"("rematchKey", "createdAt");

-- CreateIndex
CREATE INDEX "MatchProposal_cityId_sport_status_idx" ON "MatchProposal"("cityId", "sport", "status");

-- CreateIndex
CREATE INDEX "MatchProposalMember_userId_idx" ON "MatchProposalMember"("userId");

-- CreateIndex
CREATE INDEX "MatchProposalMember_intentId_idx" ON "MatchProposalMember"("intentId");

-- CreateIndex
CREATE INDEX "MatchProposalMember_proposalId_idx" ON "MatchProposalMember"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchProposalMember_proposalId_userId_key" ON "MatchProposalMember"("proposalId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayIntentGameOwnerPing_gameId_key" ON "PlayIntentGameOwnerPing"("gameId");

-- CreateIndex
CREATE INDEX "PlayIntentGameOwnerPing_ownerId_createdAt_idx" ON "PlayIntentGameOwnerPing"("ownerId", "createdAt");

-- AddForeignKey
ALTER TABLE "PlayIntent" ADD CONSTRAINT "PlayIntent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayIntent" ADD CONSTRAINT "PlayIntent_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchProposal" ADD CONSTRAINT "MatchProposal_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchProposalMember" ADD CONSTRAINT "MatchProposalMember_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "MatchProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchProposalMember" ADD CONSTRAINT "MatchProposalMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchProposalMember" ADD CONSTRAINT "MatchProposalMember_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "PlayIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
