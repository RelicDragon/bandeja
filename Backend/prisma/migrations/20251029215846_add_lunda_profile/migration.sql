-- CreateTable
CREATE TABLE "LundaProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LundaProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LundaProfile_userId_key" ON "LundaProfile"("userId");

-- AddForeignKey
ALTER TABLE "LundaProfile" ADD CONSTRAINT "LundaProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
