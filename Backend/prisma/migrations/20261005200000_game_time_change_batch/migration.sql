-- Time change: pending notices sharing a batch key (series "this and following"
-- edits) are claimed together and sent as one combined notice per player.
ALTER TABLE "GameTimeChange" ADD COLUMN "noticeBatchKey" TEXT;

CREATE INDEX "GameTimeChange_noticeBatchKey_idx" ON "GameTimeChange"("noticeBatchKey");
