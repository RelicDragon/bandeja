-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('ANNOUNCED', 'STARTED', 'FINISHED', 'ARCHIVED');

-- Drop existing default (if any)
ALTER TABLE "Game" ALTER COLUMN "status" DROP DEFAULT;

-- AlterTable: Convert existing status values to enum
-- Map old string values to new enum values
ALTER TABLE "Game" ALTER COLUMN "status" TYPE "GameStatus" 
USING CASE 
  WHEN "status" = 'scheduled' THEN 'ANNOUNCED'::"GameStatus"
  WHEN "status" = 'started' THEN 'STARTED'::"GameStatus"
  WHEN "status" = 'finished' THEN 'FINISHED'::"GameStatus"
  WHEN "status" = 'completed' THEN 'FINISHED'::"GameStatus"
  WHEN "status" = 'archived' THEN 'ARCHIVED'::"GameStatus"
  ELSE 'ANNOUNCED'::"GameStatus"
END;

-- Set default
ALTER TABLE "Game" ALTER COLUMN "status" SET DEFAULT 'ANNOUNCED'::"GameStatus";

-- CreateIndex (if not exists)
CREATE INDEX IF NOT EXISTS "Game_status_idx" ON "Game"("status");
