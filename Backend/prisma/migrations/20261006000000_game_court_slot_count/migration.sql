-- Court slots: organizer-chosen number of courts (docs/domains/booking.md "Court slots").
-- Null for every existing game = default rule (assigned courts when any, else the roster need).
ALTER TABLE "Game" ADD COLUMN "courtSlotCount" INTEGER;
