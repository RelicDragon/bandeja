-- CreateTable
CREATE TABLE "StorySegmentDismissal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceType" "StorySourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorySegmentDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StorySegmentDismissal_userId_idx" ON "StorySegmentDismissal"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StorySegmentDismissal_userId_sourceType_sourceId_key" ON "StorySegmentDismissal"("userId", "sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "StorySegmentDismissal" ADD CONSTRAINT "StorySegmentDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
