-- CreateEnum
CREATE TYPE "GameTextField" AS ENUM ('name', 'description');

-- CreateEnum
CREATE TYPE "GameTextGenerationState" AS ENUM ('pending', 'ready', 'failed', 'not_needed');

-- CreateEnum
CREATE TYPE "GameTextProvenance" AS ENUM ('automatic', 'manual_override', 'same_language', 'preserved_name', 'empty_source');

-- CreateEnum
CREATE TYPE "GameTextTranslationJobStatus" AS ENUM ('pending', 'running', 'done', 'failed', 'superseded');

-- CreateEnum
CREATE TYPE "GameTextTranslationJobErrorCategory" AS ENUM ('transient', 'validation', 'configuration', 'provider', 'unknown');

-- CreateTable
CREATE TABLE "GameTextSourceMeta" (
    "gameId" TEXT NOT NULL,
    "nameSourceRevision" INTEGER NOT NULL DEFAULT 0,
    "descriptionSourceRevision" INTEGER NOT NULL DEFAULT 0,
    "nameSourceLocaleOverride" VARCHAR(16),
    "descriptionSourceLocaleOverride" VARCHAR(16),
    "keepOriginalNameInAllLocales" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameTextSourceMeta_pkey" PRIMARY KEY ("gameId")
);

-- CreateTable
CREATE TABLE "GameTextTranslation" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "field" "GameTextField" NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "sourceRevision" INTEGER NOT NULL,
    "automaticText" TEXT,
    "generationState" "GameTextGenerationState" NOT NULL DEFAULT 'pending',
    "detectedSourceLocale" VARCHAR(16),
    "provenance" "GameTextProvenance",
    "manualOverrideText" TEXT,
    "manualOverrideSourceRevision" INTEGER,
    "manualOverrideEditedBy" TEXT,
    "manualOverrideEditedAt" TIMESTAMP(3),
    "recordRevision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameTextTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameTextTranslationCorrection" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "field" "GameTextField" NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "sourceRevision" INTEGER NOT NULL,
    "correctedText" TEXT NOT NULL,
    "sourceTextSnapshot" TEXT,
    "previousAutomaticText" TEXT,
    "editedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "GameTextTranslationCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameTextTranslationJob" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "targetLocale" VARCHAR(10) NOT NULL,
    "nameSourceRevision" INTEGER NOT NULL,
    "descriptionSourceRevision" INTEGER NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "includeName" BOOLEAN NOT NULL DEFAULT true,
    "includeDescription" BOOLEAN NOT NULL DEFAULT true,
    "status" "GameTextTranslationJobStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "claimToken" BIGINT NOT NULL DEFAULT 0,
    "errorCategory" "GameTextTranslationJobErrorCategory",
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameTextTranslationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameTextTranslation_gameId_locale_idx" ON "GameTextTranslation"("gameId", "locale");

-- CreateIndex
CREATE INDEX "GameTextTranslation_generationState_idx" ON "GameTextTranslation"("generationState");

-- CreateIndex
CREATE INDEX "GameTextTranslation_manualOverrideEditedBy_idx" ON "GameTextTranslation"("manualOverrideEditedBy");

-- CreateIndex
CREATE UNIQUE INDEX "GameTextTranslation_gameId_field_locale_key" ON "GameTextTranslation"("gameId", "field", "locale");

-- CreateIndex
CREATE INDEX "GameTextTranslationCorrection_gameId_field_locale_createdAt_idx" ON "GameTextTranslationCorrection"("gameId", "field", "locale", "createdAt");

-- CreateIndex
CREATE INDEX "GameTextTranslationCorrection_gameId_idx" ON "GameTextTranslationCorrection"("gameId");

-- CreateIndex
CREATE INDEX "GameTextTranslationCorrection_editedBy_idx" ON "GameTextTranslationCorrection"("editedBy");

-- CreateIndex
CREATE INDEX "GameTextTranslationJob_status_runAfter_idx" ON "GameTextTranslationJob"("status", "runAfter");

-- CreateIndex
CREATE INDEX "GameTextTranslationJob_leaseExpiresAt_idx" ON "GameTextTranslationJob"("leaseExpiresAt");

-- CreateIndex
CREATE INDEX "GameTextTranslationJob_gameId_idx" ON "GameTextTranslationJob"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "GameTextTranslationJob_gameId_targetLocale_nameSourceRevisi_key" ON "GameTextTranslationJob"("gameId", "targetLocale", "nameSourceRevision", "descriptionSourceRevision", "policyVersion");

-- AddForeignKey
ALTER TABLE "GameTextSourceMeta" ADD CONSTRAINT "GameTextSourceMeta_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameTextTranslation" ADD CONSTRAINT "GameTextTranslation_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameTextTranslation" ADD CONSTRAINT "GameTextTranslation_manualOverrideEditedBy_fkey" FOREIGN KEY ("manualOverrideEditedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameTextTranslationCorrection" ADD CONSTRAINT "GameTextTranslationCorrection_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameTextTranslationCorrection" ADD CONSTRAINT "GameTextTranslationCorrection_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameTextTranslationJob" ADD CONSTRAINT "GameTextTranslationJob_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

