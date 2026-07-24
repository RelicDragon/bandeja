-- AlterEnum
ALTER TYPE "MessageType" ADD VALUE 'DOCUMENT';

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "documentFileName" TEXT,
ADD COLUMN     "documentMimeType" TEXT,
ADD COLUMN     "documentSize" INTEGER;
