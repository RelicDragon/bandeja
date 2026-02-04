-- Migrate Invite rows to GameParticipant with status INVITED; then drop Invite table.
-- Backward compat: frontend still receives game.invites = participants with status INVITED (computed in app).

INSERT INTO "GameParticipant" ("id", "userId", "gameId", "role", "status", "joinedAt", "invitedByUserId", "inviteMessage", "inviteExpiresAt")
SELECT
  gen_random_uuid()::text,
  i."receiverId",
  i."gameId",
  'PARTICIPANT',
  'INVITED',
  i."createdAt",
  i."senderId",
  i."message",
  i."expiresAt"
FROM "Invite" i
WHERE i."gameId" IS NOT NULL
  AND i."status" = 'PENDING'
  AND NOT EXISTS (
    SELECT 1 FROM "GameParticipant" gp
    WHERE gp."gameId" = i."gameId" AND gp."userId" = i."receiverId"
  );

DROP TABLE "Invite";
