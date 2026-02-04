-- AlterTable
ALTER TABLE "Bug" ADD COLUMN     "lastMessagePreview" VARCHAR(500);

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "lastMessagePreview" VARCHAR(500);

-- AlterTable
ALTER TABLE "GroupChannel" ADD COLUMN     "lastMessagePreview" VARCHAR(500);

-- AlterTable
ALTER TABLE "UserChat" ADD COLUMN     "lastMessagePreview" VARCHAR(500);
