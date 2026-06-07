-- AlterTable
ALTER TABLE "GameResultsArtifactJob" ADD COLUMN     "replicatePhotoModel" TEXT;

-- CreateTable
CREATE TABLE "ResultsArtifactSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "replicatePhotoModel" TEXT NOT NULL DEFAULT 'black-forest-labs/flux-2-max',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResultsArtifactSetting_pkey" PRIMARY KEY ("id")
);
