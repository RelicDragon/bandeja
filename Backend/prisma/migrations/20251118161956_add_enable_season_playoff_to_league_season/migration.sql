-- AlterTable
ALTER TABLE "LeagueSeason" ADD COLUMN     "enablePlayoff" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "enableSeason" BOOLEAN NOT NULL DEFAULT false;
