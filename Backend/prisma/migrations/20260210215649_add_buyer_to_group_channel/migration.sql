/*
  Warnings:

  - A unique constraint covering the columns `[marketItemId,buyerId]` on the table `GroupChannel` will be added. If there are existing duplicate values, this will fail.
  - Existing marketplace GroupChannels will be deleted (clean migration - no real marketplace chats exist yet)

*/

-- Step 1: Delete existing marketplace GroupChannels (no real chats exist yet)
DELETE FROM "GroupChannel"
WHERE "marketItemId" IS NOT NULL;

-- Step 2: Drop unique constraint on marketItemId
DROP INDEX "padelpulse"."GroupChannel_marketItemId_key";

-- Step 3: Add buyerId column (nullable for backward compatibility)
ALTER TABLE "GroupChannel" ADD COLUMN "buyerId" TEXT;

-- Step 4: Add foreign key constraint
ALTER TABLE "GroupChannel" ADD CONSTRAINT "GroupChannel_buyerId_fkey"
  FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 5: Add index on buyerId for efficient queries
CREATE INDEX "GroupChannel_buyerId_idx" ON "GroupChannel"("buyerId");

-- Step 6: Add composite unique constraint with partial index (allows multiple NULL buyerIds for legacy chats)
CREATE UNIQUE INDEX "GroupChannel_marketItemId_buyerId_key"
  ON "GroupChannel"("marketItemId", "buyerId")
  WHERE "marketItemId" IS NOT NULL AND "buyerId" IS NOT NULL;
