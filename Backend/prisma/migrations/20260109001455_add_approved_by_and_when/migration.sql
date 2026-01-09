-- AlterTable
ALTER TABLE "User" ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "approvedWhen" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "User_approvedById_idx" ON "User"("approvedById");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
