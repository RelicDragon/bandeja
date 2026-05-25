-- AlterTable
ALTER TABLE "UserStoryItem" ADD COLUMN "caption" TEXT;

-- CreateTable
CREATE TABLE "StorySegmentLike" (
    "id" TEXT NOT NULL,
    "sourceType" "StorySourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorySegmentLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorySegmentComment" (
    "id" TEXT NOT NULL,
    "sourceType" "StorySourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "parentId" TEXT,
    "body" TEXT NOT NULL,
    "clientMutationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "StorySegmentComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryCommentLike" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryCommentLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryCommentReport" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" "MessageReportReason" NOT NULL,
    "description" TEXT,
    "status" "MessageReportStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryCommentReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StorySegmentLike_sourceType_sourceId_idx" ON "StorySegmentLike"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "StorySegmentLike_sourceType_sourceId_userId_key" ON "StorySegmentLike"("sourceType", "sourceId", "userId");

-- CreateIndex
CREATE INDEX "StorySegmentComment_sourceType_sourceId_createdAt_idx" ON "StorySegmentComment"("sourceType", "sourceId", "createdAt");

-- CreateIndex
CREATE INDEX "StorySegmentComment_parentId_idx" ON "StorySegmentComment"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "StorySegmentComment_authorId_clientMutationId_key" ON "StorySegmentComment"("authorId", "clientMutationId");

-- CreateIndex
CREATE UNIQUE INDEX "StoryCommentLike_commentId_userId_key" ON "StoryCommentLike"("commentId", "userId");

-- CreateIndex
CREATE INDEX "StoryCommentReport_commentId_idx" ON "StoryCommentReport"("commentId");

-- CreateIndex
CREATE INDEX "StoryCommentReport_reporterId_idx" ON "StoryCommentReport"("reporterId");

-- CreateIndex
CREATE INDEX "StoryCommentReport_status_idx" ON "StoryCommentReport"("status");

-- CreateIndex
CREATE INDEX "StoryCommentReport_createdAt_idx" ON "StoryCommentReport"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoryCommentReport_commentId_reporterId_key" ON "StoryCommentReport"("commentId", "reporterId");

-- AddForeignKey
ALTER TABLE "StorySegmentLike" ADD CONSTRAINT "StorySegmentLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorySegmentComment" ADD CONSTRAINT "StorySegmentComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorySegmentComment" ADD CONSTRAINT "StorySegmentComment_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorySegmentComment" ADD CONSTRAINT "StorySegmentComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "StorySegmentComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryCommentLike" ADD CONSTRAINT "StoryCommentLike_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "StorySegmentComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryCommentLike" ADD CONSTRAINT "StoryCommentLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryCommentReport" ADD CONSTRAINT "StoryCommentReport_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "StorySegmentComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryCommentReport" ADD CONSTRAINT "StoryCommentReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
