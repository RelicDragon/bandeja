-- AlterTable
ALTER TABLE "UserSportProfile" ADD COLUMN "inactive" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "UserSportProfile_active_sport_idx" ON "UserSportProfile" ("sport") WHERE "inactive" = false;

UPDATE "UserSportProfile" AS p
SET "inactive" = NOT (
  p."gamesPlayed" >= 5
  AND EXISTS (
    SELECT 1
    FROM "GameParticipant" gp
    INNER JOIN "Game" g ON g.id = gp."gameId"
    WHERE gp."userId" = p."userId"
      AND gp.status = 'PLAYING'::"ParticipantStatus"
      AND g.sport = p.sport
      AND g."resultsStatus" = 'FINAL'::"ResultsStatus"
      AND g."affectsRating" = true
      AND g."startTime" >= NOW() - INTERVAL '90 days'
  )
);
