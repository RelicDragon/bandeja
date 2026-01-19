-- Migrate existing JoinQueue entries to GameParticipant
-- Only migrate PENDING entries that don't already have a participant record
INSERT INTO "GameParticipant" ("id", "userId", "gameId", "role", "isPlaying", "joinedAt")
SELECT 
  gen_random_uuid()::text,
  jq."userId",
  jq."gameId",
  'PARTICIPANT',
  false,
  jq."createdAt"
FROM "JoinQueue" jq
WHERE jq."status" = 'PENDING'
AND NOT EXISTS (
  SELECT 1 FROM "GameParticipant" gp 
  WHERE gp."userId" = jq."userId" 
  AND gp."gameId" = jq."gameId"
);
