-- CreateEnum
CREATE TYPE "Sport" AS ENUM ('PADEL', 'TENNIS', 'PICKLEBALL', 'BADMINTON', 'TABLE_TENNIS', 'SQUASH');

-- AlterEnum
ALTER TYPE "ScoringPreset" ADD VALUE 'POINTS_11';
ALTER TYPE "ScoringPreset" ADD VALUE 'BEST_OF_3_11';
ALTER TYPE "ScoringPreset" ADD VALUE 'BEST_OF_5_11';
ALTER TYPE "ScoringPreset" ADD VALUE 'PAR_11';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "primarySport" "Sport" NOT NULL DEFAULT 'PADEL',
ADD COLUMN "sportsEnabled" "Sport"[] DEFAULT ARRAY['PADEL']::"Sport"[],
ADD COLUMN "lastCreatedSport" "Sport";

-- AlterTable
ALTER TABLE "Court" ADD COLUMN "sport" "Sport";

-- AlterTable
ALTER TABLE "Game" ADD COLUMN "sport" "Sport" NOT NULL DEFAULT 'PADEL';

-- AlterTable (ADR-002 match size)
ALTER TABLE "Game" ADD COLUMN "playersPerMatch" INTEGER NOT NULL DEFAULT 4;

-- Backfill: padel default 2v2; other sports default 1v1; infer 2/4 from legacy roster when 2 or 4
UPDATE "Game" SET "playersPerMatch" = CASE
  WHEN "sport" = 'PADEL' THEN
    CASE WHEN "maxParticipants" IN (2, 4) THEN "maxParticipants" ELSE 4 END
  WHEN "sport" = 'SQUASH' THEN 2
  WHEN "maxParticipants" IN (2, 4) THEN "maxParticipants"
  ELSE 2
END;

-- AlterTable
ALTER TABLE "LeagueSeason" ADD COLUMN "sport" "Sport" NOT NULL DEFAULT 'PADEL';

-- CreateTable
CREATE TABLE "UserSportProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sport" "Sport" NOT NULL,
    "level" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "reliability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "gamesWon" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSportProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserSportProfile_userId_idx" ON "UserSportProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSportProfile_userId_sport_key" ON "UserSportProfile"("userId", "sport");

-- AddForeignKey
ALTER TABLE "UserSportProfile" ADD CONSTRAINT "UserSportProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill padel profiles from User.level
INSERT INTO "UserSportProfile" ("id", "userId", "sport", "level", "reliability", "gamesPlayed", "gamesWon", "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text || u."id") || substr(md5(random()::text), 1, 9),
  u."id",
  'PADEL'::"Sport",
  u."level",
  u."reliability",
  u."gamesPlayed",
  u."gamesWon",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" u
WHERE NOT EXISTS (
  SELECT 1 FROM "UserSportProfile" p
  WHERE p."userId" = u."id" AND p."sport" = 'PADEL'
);
