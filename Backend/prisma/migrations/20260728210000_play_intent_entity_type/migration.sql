-- AlterTable
ALTER TABLE "PlayIntent" ADD COLUMN "entityType" "EntityType" NOT NULL DEFAULT 'GAME';

-- AlterTable
ALTER TABLE "MatchProposal" ADD COLUMN "entityType" "EntityType" NOT NULL DEFAULT 'GAME';

-- CreateIndex
CREATE INDEX "PlayIntent_cityId_sport_entityType_status_idx" ON "PlayIntent"("cityId", "sport", "entityType", "status");
