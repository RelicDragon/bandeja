-- CreateEnum
CREATE TYPE "ParticipantLevelUpMode" AS ENUM ('BY_MATCHES', 'BY_SETS', 'COMBINED');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "participantLevelUpMode" "ParticipantLevelUpMode" NOT NULL DEFAULT 'BY_MATCHES';
