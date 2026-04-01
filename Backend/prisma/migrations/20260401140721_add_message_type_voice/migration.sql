-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE', 'VOICE', 'POLL');

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "audioDurationMs" INTEGER,
ADD COLUMN     "messageType" "MessageType" NOT NULL DEFAULT 'TEXT',
ADD COLUMN     "waveformData" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[];
