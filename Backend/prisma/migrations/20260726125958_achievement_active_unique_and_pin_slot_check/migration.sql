-- DropIndex (full unique blocks revoke → re-award for same sourceKey)
DROP INDEX "UserAchievement_userId_definitionId_sourceKey_key";

-- CreateIndex (lookup aid; active uniqueness is partial below)
CREATE INDEX "UserAchievement_userId_definitionId_sourceKey_idx" ON "UserAchievement"("userId", "definitionId", "sourceKey");

-- Active-only uniqueness so revoked rows free the idempotency key
CREATE UNIQUE INDEX "UserAchievement_userId_definitionId_sourceKey_active_key"
ON "UserAchievement"("userId", "definitionId", "sourceKey")
WHERE "isActive" = true;

-- Showcase pin slots must be 0–2
ALTER TABLE "UserAchievementPin"
ADD CONSTRAINT "UserAchievementPin_slot_range_check"
CHECK ("slot" >= 0 AND "slot" <= 2);
