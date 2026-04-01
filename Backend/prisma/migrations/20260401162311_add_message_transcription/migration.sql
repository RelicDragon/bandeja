-- CreateTable
CREATE TABLE "MessageTranscription" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "transcription" TEXT NOT NULL,
    "languageCode" VARCHAR(16),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageTranscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessageTranscription_messageId_key" ON "MessageTranscription"("messageId");

-- CreateIndex
CREATE INDEX "MessageTranscription_messageId_idx" ON "MessageTranscription"("messageId");

-- AddForeignKey
ALTER TABLE "MessageTranscription" ADD CONSTRAINT "MessageTranscription_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageTranscription" ADD CONSTRAINT "MessageTranscription_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
