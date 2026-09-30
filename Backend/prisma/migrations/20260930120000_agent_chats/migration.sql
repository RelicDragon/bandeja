-- CreateEnum
CREATE TYPE "AgentMessageRole" AS ENUM ('USER', 'ASSISTANT', 'TOOL');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'AWAITING_CONFIRMATION', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgentActionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'EXPIRED', 'EXECUTED', 'FAILED');

-- CreateTable
CREATE TABLE "AgentChat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" VARCHAR(120),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "AgentChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentMessage" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "role" "AgentMessageRole" NOT NULL,
    "content" JSONB NOT NULL,
    "llmMessages" JSONB,
    "runId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "errorCode" VARCHAR(32),
    "model" VARCHAR(128),
    "locale" VARCHAR(16),
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "steps" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "workerId" VARCHAR(96),

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentPendingAction" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "toolName" VARCHAR(64) NOT NULL,
    "callId" VARCHAR(128),
    "args" JSONB NOT NULL,
    "preview" JSONB NOT NULL,
    "status" "AgentActionStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentPendingAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentChat_userId_archivedAt_updatedAt_idx" ON "AgentChat"("userId", "archivedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "AgentMessage_runId_idx" ON "AgentMessage"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentMessage_chatId_seq_key" ON "AgentMessage"("chatId", "seq");

-- CreateIndex
CREATE INDEX "AgentRun_chatId_status_idx" ON "AgentRun"("chatId", "status");

-- CreateIndex
CREATE INDEX "AgentRun_status_createdAt_idx" ON "AgentRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_userId_createdAt_idx" ON "AgentRun"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentPendingAction_userId_status_idx" ON "AgentPendingAction"("userId", "status");

-- CreateIndex
CREATE INDEX "AgentPendingAction_chatId_idx" ON "AgentPendingAction"("chatId");

-- CreateIndex
CREATE INDEX "AgentPendingAction_runId_idx" ON "AgentPendingAction"("runId");

-- AddForeignKey
ALTER TABLE "AgentChat" ADD CONSTRAINT "AgentChat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "AgentChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "AgentChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPendingAction" ADD CONSTRAINT "AgentPendingAction_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPendingAction" ADD CONSTRAINT "AgentPendingAction_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "AgentChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPendingAction" ADD CONSTRAINT "AgentPendingAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

