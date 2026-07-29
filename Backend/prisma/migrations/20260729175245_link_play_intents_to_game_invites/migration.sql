ALTER TABLE "GameParticipant"
ADD COLUMN "playIntentId" TEXT;

ALTER TABLE "GameInviteOutcome"
ADD COLUMN "playIntentId" TEXT;

CREATE UNIQUE INDEX "GameParticipant_playIntentId_key"
ON "GameParticipant"("playIntentId");

CREATE INDEX "GameInviteOutcome_playIntentId_idx"
ON "GameInviteOutcome"("playIntentId");

ALTER TABLE "GameParticipant"
ADD CONSTRAINT "GameParticipant_playIntentId_fkey"
FOREIGN KEY ("playIntentId") REFERENCES "PlayIntent"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GameInviteOutcome"
ADD CONSTRAINT "GameInviteOutcome_playIntentId_fkey"
FOREIGN KEY ("playIntentId") REFERENCES "PlayIntent"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
