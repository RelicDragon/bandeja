/*
  Warnings:

  - You are about to drop the column `enablePlayoff` on the `LeagueSeason` table. All the data in the column will be lost.
  - You are about to drop the column `enableSeason` on the `LeagueSeason` table. All the data in the column will be lost.
  - You are about to drop the column `gamePlayoffId` on the `LeagueSeason` table. All the data in the column will be lost.
  - You are about to drop the column `gameSeasonId` on the `LeagueSeason` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "padelpulse"."LeagueSeason" DROP CONSTRAINT IF EXISTS "LeagueSeason_gamePlayoffId_fkey";

-- DropForeignKey
ALTER TABLE "padelpulse"."LeagueSeason" DROP CONSTRAINT IF EXISTS "LeagueSeason_gameSeasonId_fkey";

-- Create Game records for existing LeagueSeasons that don't have a corresponding Game
-- Use gameSeasonId if available, otherwise use LeagueSeason.id
INSERT INTO "padelpulse"."Game" (
  "id",
  "entityType",
  "gameType",
  "name",
  "cityId",
  "startTime",
  "endTime",
  "maxParticipants",
  "minParticipants",
  "isPublic",
  "affectsRating",
  "anyoneCanInvite",
  "resultsByAnyone",
  "allowDirectJoin",
  "hasBookedCourt",
  "afterGameGoToBar",
  "hasFixedTeams",
  "genderTeams",
  "teamsReady",
  "participantsReady",
  "status",
  "resultsStatus",
  "fixedNumberOfSets",
  "maxTotalPointsPerSet",
  "maxPointsPerTeam",
  "winnerOfGame",
  "winnerOfMatch",
  "participantLevelUpMode",
  "matchGenerationType",
  "prohibitMatchesEditing",
  "pointsPerWin",
  "pointsPerLoose",
  "pointsPerTie",
  "mediaUrls",
  "photosCount",
  "createdAt",
  "updatedAt"
)
SELECT 
  ls."id",
  'LEAGUE'::"EntityType",
  'CLASSIC'::"GameType",
  NULL,
  l."cityId",
  NOW(),
  NOW(),
  4,
  0,
  true,
  true,
  false,
  false,
  false,
  false,
  false,
  l."hasFixedTeams",
  'ANY'::"GenderTeam",
  false,
  false,
  'FINISHED'::"GameStatus",
  'NONE'::"ResultsStatus",
  0,
  0,
  0,
  'BY_MATCHES_WON'::"WinnerOfGame",
  'BY_SCORES'::"WinnerOfMatch",
  'BY_MATCHES'::"ParticipantLevelUpMode",
  'HANDMADE'::"MatchGenerationType",
  false,
  0,
  0,
  0,
  ARRAY[]::TEXT[],
  0,
  ls."createdAt",
  ls."updatedAt"
FROM "padelpulse"."LeagueSeason" ls
JOIN "padelpulse"."League" l ON ls."leagueId" = l."id"
WHERE NOT EXISTS (
  SELECT 1 FROM "padelpulse"."Game" g WHERE g."id" = ls."id"
)
ON CONFLICT ("id") DO NOTHING;

-- AlterTable
ALTER TABLE "LeagueSeason" DROP COLUMN IF EXISTS "enablePlayoff",
DROP COLUMN IF EXISTS "enableSeason",
DROP COLUMN IF EXISTS "gamePlayoffId",
DROP COLUMN IF EXISTS "gameSeasonId";

-- AddForeignKey
ALTER TABLE "LeagueSeason" ADD CONSTRAINT "LeagueSeason_id_fkey" FOREIGN KEY ("id") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
