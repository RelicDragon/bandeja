-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "linkPreviewDisabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "linkPreviewUrl" TEXT;
