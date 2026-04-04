-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN "clientMutationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_senderId_clientMutationId_key" ON "ChatMessage"("senderId", "clientMutationId");
