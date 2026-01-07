-- CreateIndex
CREATE INDEX "Game_timeIsSet_clubId_startTime_idx" ON "Game"("timeIsSet", "clubId", "startTime");

-- CreateIndex
CREATE INDEX "Game_endTime_idx" ON "Game"("endTime");

-- CreateIndex
CREATE INDEX "Game_timeIsSet_courtId_idx" ON "Game"("timeIsSet", "courtId");
