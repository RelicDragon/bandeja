-- AlterTable
ALTER TABLE "GroupChannel" ADD COLUMN     "participantsCount" INTEGER NOT NULL DEFAULT 0;

-- Populate participantsCount for existing records
UPDATE "GroupChannel"
SET "participantsCount" = (
  SELECT COUNT(*)
  FROM "GroupChannelParticipant"
  WHERE "GroupChannelParticipant"."groupChannelId" = "GroupChannel"."id"
);
