-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "avatar" TEXT,
ADD COLUMN     "originalAvatar" TEXT,
ADD COLUMN     "photos" JSONB NOT NULL DEFAULT '[]';
