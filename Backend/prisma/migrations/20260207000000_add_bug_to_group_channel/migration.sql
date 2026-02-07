-- AlterTable
ALTER TABLE "GroupChannel" ADD COLUMN "bugId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "GroupChannel_bugId_key" ON "GroupChannel"("bugId");

-- AddForeignKey
ALTER TABLE "GroupChannel" ADD CONSTRAINT "GroupChannel_bugId_fkey" FOREIGN KEY ("bugId") REFERENCES "Bug"("id") ON DELETE CASCADE ON UPDATE CASCADE;
