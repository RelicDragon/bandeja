-- Club console billing: at most one live (non-VOID) charge per (club, game) and per hold.
-- Partial unique indexes; schema.prisma cannot express them (see the ClubCharge model comment).
CREATE UNIQUE INDEX "ClubCharge_live_game_key" ON "ClubCharge" ("clubId", "gameId")
  WHERE "status" <> 'VOID' AND "gameId" IS NOT NULL;

CREATE UNIQUE INDEX "ClubCharge_live_hold_key" ON "ClubCharge" ("holdId")
  WHERE "status" <> 'VOID' AND "holdId" IS NOT NULL;
