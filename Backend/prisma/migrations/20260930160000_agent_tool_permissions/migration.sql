-- CreateEnum
CREATE TYPE "AgentToolPermissionMode" AS ENUM ('ASK', 'ALWAYS_ALLOW');

-- AlterTable
ALTER TABLE "AgentPendingAction" ADD COLUMN     "autoApproved" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AgentToolPermission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "toolName" VARCHAR(64) NOT NULL,
    "mode" "AgentToolPermissionMode" NOT NULL DEFAULT 'ASK',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentToolPermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentToolPermission_userId_toolName_key" ON "AgentToolPermission"("userId", "toolName");

-- AddForeignKey
ALTER TABLE "AgentToolPermission" ADD CONSTRAINT "AgentToolPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

