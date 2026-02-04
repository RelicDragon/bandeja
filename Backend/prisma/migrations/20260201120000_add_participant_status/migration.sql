-- ParticipantStatus: GUEST (join-chat only), INVITED, IN_QUEUE, PLAYING. Backward compat: isPlaying removed. To be removed on 10-02-2026 - Invite model.
CREATE TYPE "ParticipantStatus" AS ENUM ('GUEST', 'INVITED', 'IN_QUEUE', 'PLAYING');

ALTER TABLE "GameParticipant" ADD COLUMN "status" "ParticipantStatus" NOT NULL DEFAULT 'PLAYING';
ALTER TABLE "GameParticipant" ADD COLUMN "invitedByUserId" TEXT;
ALTER TABLE "GameParticipant" ADD COLUMN "inviteMessage" TEXT;
ALTER TABLE "GameParticipant" ADD COLUMN "inviteExpiresAt" TIMESTAMP(3);

UPDATE "GameParticipant" SET "status" = 'IN_QUEUE' WHERE "isPlaying" = false;

DROP INDEX "GameParticipant_isPlaying_idx";
ALTER TABLE "GameParticipant" DROP COLUMN "isPlaying";

CREATE INDEX "GameParticipant_status_idx" ON "GameParticipant"("status");

ALTER TABLE "GameParticipant" ADD CONSTRAINT "GameParticipant_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
