-- AlterEnum
ALTER TYPE "ChatContextType" ADD VALUE 'GROUP';

-- CreateTable
CREATE TABLE "GroupChannel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar" TEXT,
    "ownerId" TEXT NOT NULL,
    "isChannel" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupChannelParticipant" (
    "id" TEXT NOT NULL,
    "groupChannelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ParticipantRole" NOT NULL DEFAULT 'PARTICIPANT',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hidden" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "GroupChannelParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupChannelInvite" (
    "id" TEXT NOT NULL,
    "groupChannelId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupChannelInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupChannel_ownerId_idx" ON "GroupChannel"("ownerId");

-- CreateIndex
CREATE INDEX "GroupChannel_isPublic_idx" ON "GroupChannel"("isPublic");

-- CreateIndex
CREATE INDEX "GroupChannel_isChannel_idx" ON "GroupChannel"("isChannel");

-- CreateIndex
CREATE INDEX "GroupChannelParticipant_groupChannelId_idx" ON "GroupChannelParticipant"("groupChannelId");

-- CreateIndex
CREATE INDEX "GroupChannelParticipant_userId_idx" ON "GroupChannelParticipant"("userId");

-- CreateIndex
CREATE INDEX "GroupChannelParticipant_hidden_idx" ON "GroupChannelParticipant"("hidden");

-- CreateIndex
CREATE UNIQUE INDEX "GroupChannelParticipant_groupChannelId_userId_key" ON "GroupChannelParticipant"("groupChannelId", "userId");

-- CreateIndex
CREATE INDEX "GroupChannelInvite_groupChannelId_idx" ON "GroupChannelInvite"("groupChannelId");

-- CreateIndex
CREATE INDEX "GroupChannelInvite_receiverId_idx" ON "GroupChannelInvite"("receiverId");

-- CreateIndex
CREATE INDEX "GroupChannelInvite_status_idx" ON "GroupChannelInvite"("status");

-- CreateIndex
CREATE INDEX "GroupChannelInvite_expiresAt_idx" ON "GroupChannelInvite"("expiresAt");

-- AddForeignKey
ALTER TABLE "GroupChannel" ADD CONSTRAINT "GroupChannel_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupChannelParticipant" ADD CONSTRAINT "GroupChannelParticipant_groupChannelId_fkey" FOREIGN KEY ("groupChannelId") REFERENCES "GroupChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupChannelParticipant" ADD CONSTRAINT "GroupChannelParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupChannelInvite" ADD CONSTRAINT "GroupChannelInvite_groupChannelId_fkey" FOREIGN KEY ("groupChannelId") REFERENCES "GroupChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupChannelInvite" ADD CONSTRAINT "GroupChannelInvite_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupChannelInvite" ADD CONSTRAINT "GroupChannelInvite_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
