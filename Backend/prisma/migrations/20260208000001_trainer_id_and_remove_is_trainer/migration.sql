-- AlterTable: Add trainerId to Game
ALTER TABLE "Game" ADD COLUMN "trainerId" TEXT;

-- Data Migration: Set game.trainerId from isTrainer participants
UPDATE "Game" g SET "trainerId" = (
  SELECT "userId" FROM "GameParticipant"
  WHERE "gameId" = g.id AND "isTrainer" = true LIMIT 1
);

-- Data Migration: Update participants with isTrainer=true to NON_PLAYING status
UPDATE "GameParticipant" SET status = 'NON_PLAYING' WHERE "isTrainer" = true;

-- AlterTable: Remove isTrainer from GameParticipant (after data migration)
ALTER TABLE "GameParticipant" DROP COLUMN "isTrainer";

-- CreateIndex: Add index on Game.trainerId
CREATE INDEX "Game_trainerId_idx" ON "Game"("trainerId");

-- AddForeignKey: Game.trainerId -> User.id
ALTER TABLE "Game" ADD CONSTRAINT "Game_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
