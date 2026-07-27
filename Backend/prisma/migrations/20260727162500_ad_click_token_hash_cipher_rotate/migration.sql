-- Reset early ad_token rows (feature not yet live in clients) and switch to hash+cipher storage.
DELETE FROM "AdClickToken";

DROP INDEX IF EXISTS "AdClickToken_token_key";
ALTER TABLE "AdClickToken" DROP COLUMN IF EXISTS "token";

ALTER TABLE "AdClickToken" ADD COLUMN "tokenHash" TEXT NOT NULL;
ALTER TABLE "AdClickToken" ADD COLUMN "tokenCipher" TEXT NOT NULL;
ALTER TABLE "AdClickToken" ADD COLUMN "revokedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "AdClickToken_tokenHash_key" ON "AdClickToken"("tokenHash");
