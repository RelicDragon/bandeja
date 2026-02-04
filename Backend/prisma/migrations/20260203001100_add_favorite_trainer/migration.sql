-- AlterTable
ALTER TABLE "User" ADD COLUMN     "favoriteTrainerId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_favoriteTrainerId_fkey" FOREIGN KEY ("favoriteTrainerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
