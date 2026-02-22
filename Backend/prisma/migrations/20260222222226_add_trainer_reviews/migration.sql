-- AlterTable
ALTER TABLE "User" ADD COLUMN     "trainerRating" DOUBLE PRECISION,
ADD COLUMN     "trainerReviewCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "trainerReviewCount1" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "trainerReviewCount2" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "trainerReviewCount3" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "trainerReviewCount4" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "trainerReviewCount5" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TrainerReview" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "text" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainerReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainerReview_trainerId_idx" ON "TrainerReview"("trainerId");

-- CreateIndex
CREATE INDEX "TrainerReview_gameId_idx" ON "TrainerReview"("gameId");

-- CreateIndex
CREATE INDEX "TrainerReview_reviewerId_idx" ON "TrainerReview"("reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainerReview_trainerId_reviewerId_gameId_key" ON "TrainerReview"("trainerId", "reviewerId", "gameId");

-- AddForeignKey
ALTER TABLE "TrainerReview" ADD CONSTRAINT "TrainerReview_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerReview" ADD CONSTRAINT "TrainerReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerReview" ADD CONSTRAINT "TrainerReview_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
