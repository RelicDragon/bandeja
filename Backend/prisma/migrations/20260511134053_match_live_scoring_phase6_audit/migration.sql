-- CreateTable
CREATE TABLE "MatchLiveScoringAudit" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "userId" TEXT,
    "revisionBefore" INTEGER,
    "revisionAfter" INTEGER,
    "clientMessageId" TEXT,
    "opId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchLiveScoringAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchLiveScoringAudit_matchId_createdAt_idx" ON "MatchLiveScoringAudit"("matchId", "createdAt");

-- CreateIndex
CREATE INDEX "MatchLiveScoringAudit_gameId_createdAt_idx" ON "MatchLiveScoringAudit"("gameId", "createdAt");

-- AddForeignKey
ALTER TABLE "MatchLiveScoringAudit" ADD CONSTRAINT "MatchLiveScoringAudit_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
