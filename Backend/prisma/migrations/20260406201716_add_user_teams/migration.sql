-- CreateEnum
CREATE TYPE "UserTeamMemberStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateTable
CREATE TABLE "UserTeam" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar" TEXT,
    "originalAvatar" TEXT,
    "ownerId" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 2,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "UserTeamMemberStatus" NOT NULL DEFAULT 'PENDING',
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserTeam_ownerId_idx" ON "UserTeam"("ownerId");

-- CreateIndex
CREATE INDEX "UserTeamMember_teamId_idx" ON "UserTeamMember"("teamId");

-- CreateIndex
CREATE INDEX "UserTeamMember_userId_idx" ON "UserTeamMember"("userId");

-- CreateIndex
CREATE INDEX "UserTeamMember_status_idx" ON "UserTeamMember"("status");

-- CreateIndex
CREATE UNIQUE INDEX "UserTeamMember_teamId_userId_key" ON "UserTeamMember"("teamId", "userId");

-- AddForeignKey
ALTER TABLE "UserTeam" ADD CONSTRAINT "UserTeam_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTeamMember" ADD CONSTRAINT "UserTeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "UserTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTeamMember" ADD CONSTRAINT "UserTeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
