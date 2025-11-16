-- CreateTable
CREATE TABLE "BugParticipant" (
    "id" TEXT NOT NULL,
    "bugId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BugParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BugParticipant_bugId_idx" ON "BugParticipant"("bugId");

-- CreateIndex
CREATE INDEX "BugParticipant_userId_idx" ON "BugParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BugParticipant_bugId_userId_key" ON "BugParticipant"("bugId", "userId");

-- AddForeignKey
ALTER TABLE "BugParticipant" ADD CONSTRAINT "BugParticipant_bugId_fkey" FOREIGN KEY ("bugId") REFERENCES "Bug"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugParticipant" ADD CONSTRAINT "BugParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
