ALTER TABLE "LeagueBracketSlot"
ADD COLUMN "scheduledClubId" TEXT,
ADD COLUMN "scheduledCourtId" TEXT,
ADD COLUMN "scheduledStartTime" TIMESTAMP(3),
ADD COLUMN "scheduledEndTime" TIMESTAMP(3);

CREATE INDEX "LeagueBracketSlot_scheduledClubId_idx"
ON "LeagueBracketSlot"("scheduledClubId");

CREATE INDEX "LeagueBracketSlot_scheduledCourtId_scheduledStartTime_idx"
ON "LeagueBracketSlot"("scheduledCourtId", "scheduledStartTime");

ALTER TABLE "LeagueBracketSlot"
ADD CONSTRAINT "LeagueBracketSlot_scheduledClubId_fkey"
FOREIGN KEY ("scheduledClubId") REFERENCES "Club"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LeagueBracketSlot"
ADD CONSTRAINT "LeagueBracketSlot_scheduledCourtId_fkey"
FOREIGN KEY ("scheduledCourtId") REFERENCES "Court"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
