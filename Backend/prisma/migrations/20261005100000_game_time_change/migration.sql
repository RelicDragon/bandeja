-- Time change: attendance reset stamp + one coalesced notice per game.
CREATE TABLE "GameTimeChange" (
    "gameId" TEXT NOT NULL,
    "attendanceResetAt" TIMESTAMP(3),
    "editorUserId" TEXT,
    "previousStartTime" TIMESTAMP(3),
    "previousEndTime" TIMESTAMP(3),
    "pendingSince" TIMESTAMP(3),
    "noticeDueAt" TIMESTAMP(3),
    "lastNoticeSentAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameTimeChange_pkey" PRIMARY KEY ("gameId")
);

CREATE INDEX "GameTimeChange_noticeDueAt_idx" ON "GameTimeChange"("noticeDueAt");

ALTER TABLE "GameTimeChange" ADD CONSTRAINT "GameTimeChange_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
