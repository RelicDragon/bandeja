-- AlterTable
ALTER TABLE "UserSportProfile" ADD COLUMN "ratingUncertainty" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "lastRatingActivityAt" TIMESTAMP(3);

