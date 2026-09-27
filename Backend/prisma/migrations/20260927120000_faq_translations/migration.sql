ALTER TABLE "GameFaq" ADD COLUMN "sourceRevision" INTEGER NOT NULL DEFAULT 1;

CREATE TYPE "GameFaqTranslationJobStatus" AS ENUM ('pending', 'running', 'done', 'failed', 'superseded');

CREATE TABLE "GameFaqTranslationPreference" (
    "gameId" TEXT NOT NULL,
    "selectedLocales" TEXT[] NOT NULL,
    "sourceLocaleOverride" VARCHAR(10),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GameFaqTranslationPreference_pkey" PRIMARY KEY ("gameId")
);

CREATE TABLE "GameFaqTranslation" (
    "id" TEXT NOT NULL,
    "faqId" TEXT NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "sourceRevision" INTEGER NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "sourceLocaleOverride" VARCHAR(10),
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "noChange" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GameFaqTranslation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GameFaqTranslationJob" (
    "id" TEXT NOT NULL,
    "faqId" TEXT NOT NULL,
    "targetLocale" VARCHAR(10) NOT NULL,
    "sourceRevision" INTEGER NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "sourceLocaleOverride" VARCHAR(10) NOT NULL DEFAULT '',
    "questionSnapshot" TEXT NOT NULL,
    "answerSnapshot" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "status" "GameFaqTranslationJobStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "claimToken" BIGINT NOT NULL DEFAULT 0,
    "errorCategory" VARCHAR(32),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GameFaqTranslationJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GameFaqTranslation_faqId_locale_key" ON "GameFaqTranslation"("faqId", "locale");
CREATE INDEX "GameFaqTranslation_faqId_idx" ON "GameFaqTranslation"("faqId");
CREATE UNIQUE INDEX "GameFaqTranslationJob_identity_key" ON "GameFaqTranslationJob"("faqId", "targetLocale", "sourceRevision", "policyVersion", "sourceLocaleOverride");
CREATE INDEX "GameFaqTranslationJob_status_runAfter_idx" ON "GameFaqTranslationJob"("status", "runAfter");
CREATE INDEX "GameFaqTranslationJob_leaseExpiresAt_idx" ON "GameFaqTranslationJob"("leaseExpiresAt");
CREATE INDEX "GameFaqTranslationJob_faqId_idx" ON "GameFaqTranslationJob"("faqId");

ALTER TABLE "GameFaqTranslationPreference" ADD CONSTRAINT "GameFaqTranslationPreference_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameFaqTranslation" ADD CONSTRAINT "GameFaqTranslation_faqId_fkey" FOREIGN KEY ("faqId") REFERENCES "GameFaq"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameFaqTranslationJob" ADD CONSTRAINT "GameFaqTranslationJob_faqId_fkey" FOREIGN KEY ("faqId") REFERENCES "GameFaq"("id") ON DELETE CASCADE ON UPDATE CASCADE;
