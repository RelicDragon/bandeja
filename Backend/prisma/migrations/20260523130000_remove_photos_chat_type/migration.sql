-- Phase C: drop legacy PHOTOS ChatType value and enforce Game.mainPhotoId -> GamePhoto FK.
-- Run migrate:delete-photos-chat before applying (no ChatMessage rows with chatType PHOTOS).

CREATE TYPE "ChatType_new" AS ENUM ('PUBLIC', 'PRIVATE', 'ADMINS');

ALTER TABLE "ChatMessage" ALTER COLUMN "chatType" DROP DEFAULT;
ALTER TABLE "ChatMessage" ALTER COLUMN "chatType" TYPE "ChatType_new" USING ("chatType"::text::"ChatType_new");
ALTER TABLE "ChatMessage" ALTER COLUMN "chatType" SET DEFAULT 'PUBLIC'::"ChatType_new";

ALTER TABLE "ChatDraft" ALTER COLUMN "chatType" DROP DEFAULT;
ALTER TABLE "ChatDraft" ALTER COLUMN "chatType" TYPE "ChatType_new" USING ("chatType"::text::"ChatType_new");
ALTER TABLE "ChatDraft" ALTER COLUMN "chatType" SET DEFAULT 'PUBLIC'::"ChatType_new";

ALTER TABLE "ChatReadCursor" ALTER COLUMN "chatType" DROP DEFAULT;
ALTER TABLE "ChatReadCursor" ALTER COLUMN "chatType" TYPE "ChatType_new" USING ("chatType"::text::"ChatType_new");
ALTER TABLE "ChatReadCursor" ALTER COLUMN "chatType" SET DEFAULT 'PUBLIC'::"ChatType_new";

ALTER TABLE "PinnedMessage" ALTER COLUMN "chatType" DROP DEFAULT;
ALTER TABLE "PinnedMessage" ALTER COLUMN "chatType" TYPE "ChatType_new" USING ("chatType"::text::"ChatType_new");
ALTER TABLE "PinnedMessage" ALTER COLUMN "chatType" SET DEFAULT 'PUBLIC'::"ChatType_new";

DROP TYPE "ChatType";
ALTER TYPE "ChatType_new" RENAME TO "ChatType";

-- Enforce gallery main photo references GamePhoto rows only.
ALTER TABLE "Game" ADD CONSTRAINT "Game_mainPhotoId_fkey" FOREIGN KEY ("mainPhotoId") REFERENCES "GamePhoto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
