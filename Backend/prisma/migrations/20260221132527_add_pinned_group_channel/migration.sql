-- CreateTable
CREATE TABLE "PinnedGroupChannel" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupChannelId" TEXT NOT NULL,
    "pinnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PinnedGroupChannel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PinnedGroupChannel_userId_idx" ON "PinnedGroupChannel"("userId");

-- CreateIndex
CREATE INDEX "PinnedGroupChannel_groupChannelId_idx" ON "PinnedGroupChannel"("groupChannelId");

-- CreateIndex
CREATE UNIQUE INDEX "PinnedGroupChannel_userId_groupChannelId_key" ON "PinnedGroupChannel"("userId", "groupChannelId");

-- AddForeignKey
ALTER TABLE "PinnedGroupChannel" ADD CONSTRAINT "PinnedGroupChannel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PinnedGroupChannel" ADD CONSTRAINT "PinnedGroupChannel_groupChannelId_fkey" FOREIGN KEY ("groupChannelId") REFERENCES "GroupChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
