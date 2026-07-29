-- Normalize safely-recoverable stale active rows before enforcing the
-- one-active-intent-per-user-and-city invariant.
BEGIN;

UPDATE "PlayIntent" AS intent
SET "status" = 'EXPIRED'::"PlayIntentStatus",
    "updatedAt" = CURRENT_TIMESTAMP
WHERE intent."status" IN ('OPEN', 'MATCHED')
  AND intent."expiresAt" <= CURRENT_TIMESTAMP
  AND NOT EXISTS (
    SELECT 1
    FROM "GameParticipant" AS participant
    WHERE participant."playIntentId" = intent."id"
  );

CREATE TEMP TABLE "_play_intent_duplicate_losers"
ON COMMIT DROP
AS
WITH ranked AS (
  SELECT
    intent."id",
    EXISTS (
      SELECT 1
      FROM "GameParticipant" AS participant
      WHERE participant."playIntentId" = intent."id"
    ) AS "hasLinkedParticipant",
    ROW_NUMBER() OVER (
      PARTITION BY intent."userId", intent."cityId"
      ORDER BY
        EXISTS (
          SELECT 1
          FROM "GameParticipant" AS participant
          WHERE participant."playIntentId" = intent."id"
        ) DESC,
        intent."expiresAt" DESC,
        intent."createdAt" DESC,
        intent."id" DESC
    ) AS "position"
  FROM "PlayIntent" AS intent
  WHERE intent."status" IN ('OPEN', 'MATCHED')
)
SELECT "id"
FROM ranked
WHERE "position" > 1
  AND NOT "hasLinkedParticipant";

CREATE TEMP TABLE "_play_intent_duplicate_proposals"
ON COMMIT DROP
AS
SELECT DISTINCT proposal."id"
FROM "MatchProposal" AS proposal
JOIN "MatchProposalMember" AS member
  ON member."proposalId" = proposal."id"
JOIN "_play_intent_duplicate_losers" AS loser
  ON loser."id" = member."intentId"
WHERE proposal."status" IN ('PENDING', 'ACCEPTED')
  AND proposal."gameId" IS NULL;

UPDATE "MatchProposal" AS proposal
SET "status" = 'DECLINED'::"MatchProposalStatus",
    "hostUserId" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
FROM "_play_intent_duplicate_proposals" AS duplicate
WHERE proposal."id" = duplicate."id";

UPDATE "PlayIntent" AS intent
SET "status" = 'CANCELLED'::"PlayIntentStatus",
    "updatedAt" = CURRENT_TIMESTAMP
FROM "_play_intent_duplicate_losers" AS loser
WHERE intent."id" = loser."id";

-- Return non-duplicate peers from any dissolved proposal to the pool when
-- they are not reserved elsewhere.
UPDATE "PlayIntent" AS intent
SET "status" = CASE
      WHEN intent."expiresAt" > CURRENT_TIMESTAMP
        THEN 'OPEN'::"PlayIntentStatus"
      ELSE 'EXPIRED'::"PlayIntentStatus"
    END,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE intent."status" = 'MATCHED'
  AND EXISTS (
    SELECT 1
    FROM "MatchProposalMember" AS member
    JOIN "_play_intent_duplicate_proposals" AS duplicate
      ON duplicate."id" = member."proposalId"
    WHERE member."intentId" = intent."id"
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "_play_intent_duplicate_losers" AS loser
    WHERE loser."id" = intent."id"
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "GameParticipant" AS participant
    WHERE participant."playIntentId" = intent."id"
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "MatchProposalMember" AS member
    JOIN "MatchProposal" AS proposal
      ON proposal."id" = member."proposalId"
    WHERE member."intentId" = intent."id"
      AND proposal."status" IN ('PENDING', 'ACCEPTED')
      AND proposal."gameId" IS NULL
  );

-- If multiple active rows are independently linked to game participants,
-- creation of this index intentionally fails instead of silently severing a
-- reservation. That state requires manual reconciliation.
CREATE UNIQUE INDEX "PlayIntent_one_active_per_user_city_key"
ON "PlayIntent" ("userId", "cityId")
WHERE "status" IN ('OPEN', 'MATCHED');

CREATE INDEX "PlayIntentNotificationDelivery_userId_notificationType_createdAt_idx"
ON "PlayIntentNotificationDelivery" ("userId", "notificationType", "createdAt");

COMMIT;
