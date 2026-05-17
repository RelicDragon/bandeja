-- CreateEnum
CREATE TYPE "GameInviteOutcomeType" AS ENUM ('DECLINED', 'CANCELLED');

-- CreateTable
CREATE TABLE "GameInviteOutcome" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "outcome" "GameInviteOutcomeType" NOT NULL,
    "invitedByUserId" TEXT,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameInviteOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameInviteOutcome_gameId_idx" ON "GameInviteOutcome"("gameId");

-- CreateIndex
CREATE INDEX "GameInviteOutcome_userId_idx" ON "GameInviteOutcome"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GameInviteOutcome_gameId_userId_key" ON "GameInviteOutcome"("gameId", "userId");

-- AddForeignKey
ALTER TABLE "GameInviteOutcome" ADD CONSTRAINT "GameInviteOutcome_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameInviteOutcome" ADD CONSTRAINT "GameInviteOutcome_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameInviteOutcome" ADD CONSTRAINT "GameInviteOutcome_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill terminal invite participants into GameInviteOutcome, then remove those rows
INSERT INTO "GameInviteOutcome" ("id", "gameId", "userId", "outcome", "invitedByUserId", "closedAt")
SELECT
  'gio_' || gp."id",
  gp."gameId",
  gp."userId",
  CASE
    WHEN gp."status" = 'INVITE_DECLINED' THEN 'DECLINED'::"GameInviteOutcomeType"
    ELSE 'CANCELLED'::"GameInviteOutcomeType"
  END,
  gp."invitedByUserId",
  COALESCE(gp."inviteClosedAt", gp."joinedAt")
FROM "GameParticipant" gp
WHERE gp."status" IN ('INVITE_DECLINED', 'INVITE_CANCELLED')
ON CONFLICT ("gameId", "userId") DO UPDATE SET
  "outcome" = EXCLUDED."outcome",
  "invitedByUserId" = EXCLUDED."invitedByUserId",
  "closedAt" = EXCLUDED."closedAt";

DELETE FROM "GameParticipant"
WHERE "status" IN ('INVITE_DECLINED', 'INVITE_CANCELLED');
