-- CreateIndex
CREATE INDEX "Game_cityId_startTime_idx" ON "Game"("cityId", "startTime");

-- CreateIndex
CREATE INDEX "GameParticipant_gameId_status_idx" ON "GameParticipant"("gameId", "status");
