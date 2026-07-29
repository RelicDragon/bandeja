UPDATE "MatchProposal" AS proposal
SET
  "gameId" = NULL,
  "status" = CASE
    WHEN proposal."status" = 'CONVERTED_TO_GAME'
      THEN 'DECLINED'::"MatchProposalStatus"
    ELSE proposal."status"
  END,
  "hostUserId" = CASE
    WHEN proposal."status" = 'CONVERTED_TO_GAME' THEN NULL
    ELSE proposal."hostUserId"
  END
WHERE proposal."gameId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "Game"
    WHERE "Game"."id" = proposal."gameId"
  );

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "gameId"
      ORDER BY "updatedAt" DESC, "id" DESC
    ) AS row_number
  FROM "MatchProposal"
  WHERE "gameId" IS NOT NULL
)
UPDATE "MatchProposal"
SET
  "gameId" = NULL,
  "status" = CASE
    WHEN "MatchProposal"."status" = 'CONVERTED_TO_GAME'
      THEN 'DECLINED'::"MatchProposalStatus"
    ELSE "MatchProposal"."status"
  END,
  "hostUserId" = CASE
    WHEN "MatchProposal"."status" = 'CONVERTED_TO_GAME' THEN NULL
    ELSE "MatchProposal"."hostUserId"
  END
FROM ranked
WHERE "MatchProposal"."id" = ranked."id"
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX "MatchProposal_gameId_key"
ON "MatchProposal"("gameId");

ALTER TABLE "MatchProposal"
ADD CONSTRAINT "MatchProposal_gameId_fkey"
FOREIGN KEY ("gameId") REFERENCES "Game"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
