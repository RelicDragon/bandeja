-- AlterEnum: Add NON_PLAYING to ParticipantStatus
-- Cannot use new enum value in same transaction, so add it separately
ALTER TYPE "ParticipantStatus" ADD VALUE 'NON_PLAYING';
