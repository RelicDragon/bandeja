-- AlterTable
ALTER TABLE "User" ADD COLUMN     "genderIsSet" BOOLEAN NOT NULL DEFAULT false;

-- Update existing users: set genderIsSet to true for MALE/FEMALE, false for PREFER_NOT_TO_SAY
UPDATE "User" SET "genderIsSet" = true WHERE "gender" IN ('MALE', 'FEMALE');
UPDATE "User" SET "genderIsSet" = false WHERE "gender" = 'PREFER_NOT_TO_SAY';
