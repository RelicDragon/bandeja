import { Prisma } from '@prisma/client';

/** Follows `WITH eligible AS (...),` — references `eligible`. */
export const reliabilityDecayActivityArms = Prisma.sql`
  outcome_times AS (
    SELECT go."userId" AS uid, MAX(go."createdAt") AS t
    FROM "GameOutcome" go
    INNER JOIN "Game" g ON g.id = go."gameId"
    INNER JOIN eligible e ON e.id = go."userId"
    WHERE g."entityType" NOT IN ('BAR'::"EntityType", 'LEAGUE_SEASON'::"EntityType")
    GROUP BY go."userId"
  ),
  game_times AS (
    SELECT gp."userId" AS uid, MAX(g."finishedDate") AS t
    FROM "GameParticipant" gp
    INNER JOIN "Game" g ON g.id = gp."gameId"
    INNER JOIN eligible e ON e.id = gp."userId"
    WHERE gp.status = 'PLAYING'::"ParticipantStatus"
      AND g."resultsStatus" = 'FINAL'::"ResultsStatus"
      AND g."entityType" NOT IN ('BAR'::"EntityType", 'LEAGUE_SEASON'::"EntityType")
      AND g."finishedDate" IS NOT NULL
    GROUP BY gp."userId"
  )
`;

export const lastActivityAtSelect = Prisma.sql`
  CASE
    WHEN o.t IS NULL AND gt.t IS NULL THEN NULL
    WHEN o.t IS NULL THEN gt.t
    WHEN gt.t IS NULL THEN o.t
    ELSE GREATEST(o.t, gt.t)
  END AS "lastActivityAt"
`;
