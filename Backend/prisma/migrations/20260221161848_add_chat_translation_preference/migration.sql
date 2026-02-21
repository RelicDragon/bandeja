-- CreateTable
CREATE TABLE "ChatTranslationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chatContextType" "ChatContextType" NOT NULL,
    "contextId" TEXT NOT NULL,
    "translateToLanguage" VARCHAR(10),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatTranslationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatTranslationPreference_userId_idx" ON "ChatTranslationPreference"("userId");

-- CreateIndex
CREATE INDEX "ChatTranslationPreference_chatContextType_contextId_idx" ON "ChatTranslationPreference"("chatContextType", "contextId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatTranslationPreference_userId_chatContextType_contextId_key" ON "ChatTranslationPreference"("userId", "chatContextType", "contextId");

-- AddForeignKey
ALTER TABLE "ChatTranslationPreference" ADD CONSTRAINT "ChatTranslationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
