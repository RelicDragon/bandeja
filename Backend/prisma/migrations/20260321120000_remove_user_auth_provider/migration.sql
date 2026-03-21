-- AlterTable
ALTER TABLE "User" DROP COLUMN "authProvider";

-- DropEnum
DROP TYPE "AuthProvider";
