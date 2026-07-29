-- AlterTable
ALTER TABLE "PlayIntent" DROP COLUMN "myGenderOnly",
ADD COLUMN     "genderTeams" "GenderTeam" NOT NULL DEFAULT 'ANY';
