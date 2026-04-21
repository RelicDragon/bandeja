UPDATE "Game" SET "matchGenerationType" = 'AUTOMATIC' WHERE "matchGenerationType" = 'HANDMADE' AND "maxParticipants" IN (2, 4);
