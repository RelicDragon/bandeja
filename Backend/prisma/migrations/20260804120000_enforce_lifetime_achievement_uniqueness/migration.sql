-- UNIQUE and MILESTONE definitions use an empty sourceKey. Unlike REPEATABLE
-- awards, they remain unique even if an instance is later soft-revoked.
CREATE UNIQUE INDEX "UserAchievement_userId_definitionId_lifetime_key"
ON "UserAchievement"("userId", "definitionId")
WHERE "sourceKey" = '';
