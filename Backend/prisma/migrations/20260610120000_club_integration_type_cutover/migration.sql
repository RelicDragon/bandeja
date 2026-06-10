-- CreateEnum
CREATE TYPE "ClubIntegrationType" AS ENUM ('BOOKTIME');

-- AlterTable: add integrationType before dropping legacy columns
ALTER TABLE "Club" ADD COLUMN "integrationType" "ClubIntegrationType";

-- Migrate existing CRS script clubs to online booking (Padel City Centar, Novi Sad)
UPDATE "Club"
SET
  "integrationType" = 'BOOKTIME',
  "integrationConfig" = COALESCE("integrationConfig", '{}'::jsonb) || '{"companyId": "d4130d78-a7e8-499d-90f0-92773ccc2f9c"}'::jsonb
WHERE "integrationScriptName" IS NOT NULL;

-- DropIndex
DROP INDEX "Club_integrationScriptName_idx";

-- AlterTable: drop legacy script columns
ALTER TABLE "Club" DROP COLUMN "integrationScriptDateIndependent",
DROP COLUMN "integrationScriptName";

-- CreateIndex
CREATE INDEX "Club_integrationType_idx" ON "Club"("integrationType");
