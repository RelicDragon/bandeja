-- CreateTable
CREATE TABLE "UserFavoriteUser" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "favoriteUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserFavoriteUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserFavoriteUser_userId_idx" ON "UserFavoriteUser"("userId");

-- CreateIndex
CREATE INDEX "UserFavoriteUser_favoriteUserId_idx" ON "UserFavoriteUser"("favoriteUserId");

-- CreateIndex
CREATE UNIQUE INDEX "UserFavoriteUser_userId_favoriteUserId_key" ON "UserFavoriteUser"("userId", "favoriteUserId");

-- AddForeignKey
ALTER TABLE "UserFavoriteUser" ADD CONSTRAINT "UserFavoriteUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFavoriteUser" ADD CONSTRAINT "UserFavoriteUser_favoriteUserId_fkey" FOREIGN KEY ("favoriteUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
