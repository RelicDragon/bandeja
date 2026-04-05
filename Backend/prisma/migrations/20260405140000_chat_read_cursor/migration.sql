CREATE TABLE "ChatReadCursor" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chatContextType" "ChatContextType" NOT NULL,
    "contextId" TEXT NOT NULL,
    "chatType" "ChatType" NOT NULL DEFAULT 'PUBLIC',
    "readMaxServerSyncSeq" INTEGER NOT NULL DEFAULT -1,
    "readMaxCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT TIMESTAMP '1970-01-01 00:00:00',
    "readMaxMessageId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatReadCursor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatReadCursor_userId_chatContextType_contextId_chatType_key" ON "ChatReadCursor"("userId", "chatContextType", "contextId", "chatType");

CREATE INDEX "ChatReadCursor_userId_idx" ON "ChatReadCursor"("userId");

ALTER TABLE "ChatReadCursor" ADD CONSTRAINT "ChatReadCursor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ChatReadCursor" ("id", "userId", "chatContextType", "contextId", "chatType", "readMaxServerSyncSeq", "readMaxCreatedAt", "readMaxMessageId", "createdAt", "updatedAt")
SELECT
    md5(random()::text || clock_timestamp()::text || random()::text),
    x."userId",
    x."chatContextType",
    x."contextId",
    x."chatType",
    COALESCE(x."serverSyncSeq", -1),
    x."createdAt",
    x."id",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT ON (r."userId", m."chatContextType", m."contextId", m."chatType")
        r."userId",
        m."chatContextType",
        m."contextId",
        m."chatType",
        m."serverSyncSeq",
        m."createdAt",
        m."id"
    FROM "MessageReadReceipt" r
    INNER JOIN "ChatMessage" m ON m.id = r."messageId"
    ORDER BY r."userId", m."chatContextType", m."contextId", m."chatType",
        COALESCE(m."serverSyncSeq", -1) DESC,
        m."createdAt" DESC,
        m."id" DESC
) x;
