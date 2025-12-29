-- AlterTable
ALTER TABLE padelpulse."User" ADD COLUMN     "timeFormat" TEXT NOT NULL DEFAULT 'auto',
ADD COLUMN     "weekStart" TEXT NOT NULL DEFAULT 'auto',
ALTER COLUMN "language" SET DEFAULT 'auto';

UPDATE padelpulse."User" SET "language" = 'auto' WHERE "language" IS NULL;
