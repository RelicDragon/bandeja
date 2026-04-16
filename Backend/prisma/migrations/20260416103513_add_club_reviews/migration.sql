-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "clubRating" DOUBLE PRECISION,
ADD COLUMN     "clubReviewCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ClubReview" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "text" VARCHAR(1000),
    "photos" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClubReview_clubId_idx" ON "ClubReview"("clubId");

-- CreateIndex
CREATE INDEX "ClubReview_gameId_idx" ON "ClubReview"("gameId");

-- CreateIndex
CREATE INDEX "ClubReview_reviewerId_idx" ON "ClubReview"("reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubReview_reviewerId_gameId_key" ON "ClubReview"("reviewerId", "gameId");

-- AddForeignKey
ALTER TABLE "ClubReview" ADD CONSTRAINT "ClubReview_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubReview" ADD CONSTRAINT "ClubReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubReview" ADD CONSTRAINT "ClubReview_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
