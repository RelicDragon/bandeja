-- CreateTable
CREATE TABLE "CancelledGame" (
    "id" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "name" TEXT,
    "cancelledByUserId" TEXT NOT NULL,
    "cancelledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cityId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CancelledGame_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CancelledGame_cityId_idx" ON "CancelledGame"("cityId");

-- AddForeignKey
ALTER TABLE "CancelledGame" ADD CONSTRAINT "CancelledGame_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;
