-- AlterEnum
ALTER TYPE "SportLevelSource" ADD VALUE 'PLAYTOMIC';

-- AlterTable
ALTER TABLE "UserSportProfile" ADD COLUMN     "externalRatingHint" VARCHAR(32);
