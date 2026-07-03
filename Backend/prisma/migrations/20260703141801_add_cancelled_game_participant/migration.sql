-- AlterTable
ALTER TABLE "CancelledGame" ADD COLUMN     "parentId" TEXT;

-- CreateTable
CREATE TABLE "CancelledGameParticipant" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ParticipantRole" NOT NULL,
    "status" "ParticipantStatus" NOT NULL,

    CONSTRAINT "CancelledGameParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CancelledGameParticipant_userId_idx" ON "CancelledGameParticipant"("userId");

-- CreateIndex
CREATE INDEX "CancelledGameParticipant_gameId_idx" ON "CancelledGameParticipant"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "CancelledGameParticipant_gameId_userId_key" ON "CancelledGameParticipant"("gameId", "userId");

-- CreateIndex
CREATE INDEX "CancelledGame_parentId_idx" ON "CancelledGame"("parentId");

-- AddForeignKey
ALTER TABLE "CancelledGameParticipant" ADD CONSTRAINT "CancelledGameParticipant_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "CancelledGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancelledGameParticipant" ADD CONSTRAINT "CancelledGameParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
