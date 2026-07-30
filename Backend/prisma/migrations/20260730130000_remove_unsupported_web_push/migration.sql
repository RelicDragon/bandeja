BEGIN;

-- WEB registration was exposed in the enum but never had a delivery provider.
-- Remove any inert rows before tightening the platform contract.
DELETE FROM "PushToken"
WHERE "platform" = 'WEB';

ALTER TYPE "PushPlatform" RENAME TO "PushPlatform_old";
CREATE TYPE "PushPlatform" AS ENUM ('IOS', 'ANDROID');

ALTER TABLE "PushToken"
ALTER COLUMN "platform" TYPE "PushPlatform"
USING ("platform"::text::"PushPlatform");

DROP TYPE "PushPlatform_old";

COMMIT;
