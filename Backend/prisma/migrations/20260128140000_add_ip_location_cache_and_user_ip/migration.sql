-- CreateTable
CREATE TABLE "IpLocationCache" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "meta" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IpLocationCache_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastUserIP" TEXT,
ADD COLUMN     "latitudeByIP" DOUBLE PRECISION,
ADD COLUMN     "longitudeByIP" DOUBLE PRECISION;

-- CreateIndex
CREATE UNIQUE INDEX "IpLocationCache_ip_key" ON "IpLocationCache"("ip");

-- CreateIndex
CREATE INDEX "IpLocationCache_ip_idx" ON "IpLocationCache"("ip");
