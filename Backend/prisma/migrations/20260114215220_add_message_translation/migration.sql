-- CreateTable
CREATE TABLE "MessageTranslation" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "languageCode" VARCHAR(10) NOT NULL,
    "translation" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageTranslation_messageId_idx" ON "MessageTranslation"("messageId");

-- CreateIndex
CREATE INDEX "MessageTranslation_languageCode_idx" ON "MessageTranslation"("languageCode");

-- CreateIndex
CREATE UNIQUE INDEX "MessageTranslation_messageId_languageCode_key" ON "MessageTranslation"("messageId", "languageCode");

-- AddForeignKey
ALTER TABLE "MessageTranslation" ADD CONSTRAINT "MessageTranslation_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageTranslation" ADD CONSTRAINT "MessageTranslation_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
