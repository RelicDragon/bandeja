-- Optional per-campaign calendar tag rendered as an ultra-small row at the bottom
-- of each calendar day cell for eligible users (dismiss/snooze do not hide it).
ALTER TABLE "AdCampaign" ADD COLUMN "calendarTagEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AdCampaign" ADD COLUMN "calendarTagLabel" TEXT;
ALTER TABLE "AdCampaign" ADD COLUMN "calendarTagStartsAt" TIMESTAMP(3);
ALTER TABLE "AdCampaign" ADD COLUMN "calendarTagEndsAt" TIMESTAMP(3);
