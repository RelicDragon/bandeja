-- CreateTable
CREATE TABLE "UserUnreadState" (
    "userId" TEXT NOT NULL,
    "unreadRevision" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserUnreadState_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "UserContextUnreadState" (
    "userId" TEXT NOT NULL,
    "contextKey" TEXT NOT NULL,
    "contextType" "ChatContextType" NOT NULL,
    "contextId" TEXT NOT NULL,
    "unreadRevision" INTEGER NOT NULL DEFAULT 0,
    "unreadCountSnapshot" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserContextUnreadState_pkey" PRIMARY KEY ("userId","contextKey")
);

-- CreateIndex
CREATE INDEX "UserContextUnreadState_userId_unreadRevision_idx" ON "UserContextUnreadState"("userId", "unreadRevision");

-- CreateIndex
CREATE INDEX "UserContextUnreadState_contextType_contextId_idx" ON "UserContextUnreadState"("contextType", "contextId");

-- AddForeignKey
ALTER TABLE "UserUnreadState" ADD CONSTRAINT "UserUnreadState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserContextUnreadState" ADD CONSTRAINT "UserContextUnreadState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
