-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "forwardedFrom" JSONB,
ADD COLUMN     "forwardedFromMessageId" TEXT;

-- CreateIndex
CREATE INDEX "ChatMessage_forwardedFromMessageId_idx" ON "ChatMessage"("forwardedFromMessageId");

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_forwardedFromMessageId_fkey" FOREIGN KEY ("forwardedFromMessageId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
