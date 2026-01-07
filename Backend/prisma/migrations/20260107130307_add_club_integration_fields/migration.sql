-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "integrationConfig" JSONB,
ADD COLUMN     "integrationScriptName" TEXT,
ADD COLUMN     "lastSlotUpdate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Court" ADD COLUMN     "externalCourtId" TEXT;

-- CreateIndex
CREATE INDEX "Club_integrationScriptName_idx" ON "Club"("integrationScriptName");

-- CreateIndex
CREATE INDEX "Court_externalCourtId_idx" ON "Court"("externalCourtId");
