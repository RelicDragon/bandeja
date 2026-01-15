/*
  Warnings:

  - You are about to drop the column `ownerId` on the `GroupChannel` table. All the data in the column will be lost.

*/
-- Migrate existing owners to participants with OWNER role
INSERT INTO "GroupChannelParticipant" ("id", "groupChannelId", "userId", "role", "joinedAt", "hidden")
SELECT 
  gen_random_uuid()::text,
  gc."id",
  gc."ownerId",
  'OWNER'::"ParticipantRole",
  gc."createdAt",
  false
FROM "GroupChannel" gc
WHERE gc."ownerId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 
    FROM "GroupChannelParticipant" gcp 
    WHERE gcp."groupChannelId" = gc."id" 
      AND gcp."userId" = gc."ownerId"
  );

-- DropForeignKey
ALTER TABLE "padelpulse"."GroupChannel" DROP CONSTRAINT "GroupChannel_ownerId_fkey";

-- DropIndex
DROP INDEX "padelpulse"."GroupChannel_ownerId_idx";

-- AlterTable
ALTER TABLE "GroupChannel" DROP COLUMN "ownerId";
