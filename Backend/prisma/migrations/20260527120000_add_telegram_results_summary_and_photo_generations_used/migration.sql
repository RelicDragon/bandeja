-- Columns may already exist on DBs that were synced via db push; IF NOT EXISTS avoids drift failures.
ALTER TABLE "Game" ADD COLUMN IF NOT EXISTS "telegramResultsSummary" TEXT;

ALTER TABLE "GameResultsArtifactJob" ADD COLUMN IF NOT EXISTS "photoGenerationsUsed" INTEGER NOT NULL DEFAULT 0;
