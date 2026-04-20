-- Optional link from a game invite to a user-team; used to auto-create fixed teams when all members join.
ALTER TABLE "GameParticipant" ADD COLUMN "inviteUserTeamId" TEXT;

CREATE INDEX "GameParticipant_inviteUserTeamId_idx" ON "GameParticipant"("inviteUserTeamId");
