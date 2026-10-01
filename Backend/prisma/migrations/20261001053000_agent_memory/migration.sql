-- CreateEnum
CREATE TYPE "AgentMemoryType" AS ENUM ('PREFERENCE', 'FEEDBACK', 'FACT');

-- CreateEnum
CREATE TYPE "AgentMemorySource" AS ENUM ('USER_ASKED', 'MODEL_INFERRED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "agentMemoryEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "AgentMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "description" VARCHAR(160) NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "type" "AgentMemoryType" NOT NULL,
    "source" "AgentMemorySource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "AgentMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentMemory_userId_name_key" ON "AgentMemory"("userId", "name");

-- AddForeignKey
ALTER TABLE "AgentMemory" ADD CONSTRAINT "AgentMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
