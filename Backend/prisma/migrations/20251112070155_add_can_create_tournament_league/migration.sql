-- AlterTable
ALTER TABLE "User" ADD COLUMN     "canCreateLeague" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canCreateTournament" BOOLEAN NOT NULL DEFAULT false;
