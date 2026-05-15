-- AlterEnum
ALTER TYPE "MessageType" ADD VALUE 'VIDEO';

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "videoDurationMs" INTEGER,
ADD COLUMN     "videoHeight" INTEGER,
ADD COLUMN     "videoWidth" INTEGER;
