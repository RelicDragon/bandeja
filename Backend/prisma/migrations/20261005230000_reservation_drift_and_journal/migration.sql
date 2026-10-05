-- CreateEnum
CREATE TYPE "GameExternalBookingUpstreamState" AS ENUM ('OK', 'MOVED', 'MISSING', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "GameReservationChangeState" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'ROLLED_BACK', 'ABANDONED');

-- CreateEnum
CREATE TYPE "GameReservationChangeStepStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED', 'SKIPPED', 'NEEDS_CLUB');

-- AlterTable
ALTER TABLE "GameExternalBooking" ADD COLUMN     "upstreamCheckedAt" TIMESTAMP(3),
ADD COLUMN     "upstreamEnd" TIMESTAMP(3),
ADD COLUMN     "upstreamStart" TIMESTAMP(3),
ADD COLUMN     "upstreamState" "GameExternalBookingUpstreamState" NOT NULL DEFAULT 'OK';

-- CreateTable
CREATE TABLE "GameReservationChange" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "createdById" TEXT,
    "state" "GameReservationChangeState" NOT NULL DEFAULT 'RUNNING',
    "plan" JSONB NOT NULL,
    "fromStart" TIMESTAMP(3) NOT NULL,
    "fromEnd" TIMESTAMP(3) NOT NULL,
    "toStart" TIMESTAMP(3) NOT NULL,
    "toEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameReservationChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameReservationChangeStep" (
    "id" TEXT NOT NULL,
    "changeId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "GameReservationChangeStepStatus" NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameReservationChangeStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameReservationChange_gameId_state_idx" ON "GameReservationChange"("gameId", "state");

-- CreateIndex
CREATE INDEX "GameReservationChange_createdById_idx" ON "GameReservationChange"("createdById");

-- CreateIndex
CREATE INDEX "GameReservationChangeStep_status_idx" ON "GameReservationChangeStep"("status");

-- CreateIndex
CREATE UNIQUE INDEX "GameReservationChangeStep_changeId_idempotencyKey_key" ON "GameReservationChangeStep"("changeId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "GameReservationChange" ADD CONSTRAINT "GameReservationChange_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameReservationChange" ADD CONSTRAINT "GameReservationChange_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameReservationChangeStep" ADD CONSTRAINT "GameReservationChangeStep_changeId_fkey" FOREIGN KEY ("changeId") REFERENCES "GameReservationChange"("id") ON DELETE CASCADE ON UPDATE CASCADE;
