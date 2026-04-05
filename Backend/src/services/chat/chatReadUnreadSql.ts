import { Prisma } from '@prisma/client';

export function sqlMessageNotReadByUser(userId: string): Prisma.Sql {
  return Prisma.sql`
    NOT (
      EXISTS (
        SELECT 1 FROM "MessageReadReceipt" r
        WHERE r."messageId" = m.id AND r."userId" = ${userId}
      )
      OR EXISTS (
        SELECT 1 FROM "ChatReadCursor" c
        WHERE c."userId" = ${userId}
          AND c."chatContextType" = m."chatContextType"
          AND c."contextId" = m."contextId"
          AND c."chatType" = m."chatType"
          AND (
            COALESCE(m."serverSyncSeq", -1) < c."readMaxServerSyncSeq"
            OR (
              COALESCE(m."serverSyncSeq", -1) = c."readMaxServerSyncSeq"
              AND m."createdAt" < c."readMaxCreatedAt"
            )
            OR (
              COALESCE(m."serverSyncSeq", -1) = c."readMaxServerSyncSeq"
              AND m."createdAt" = c."readMaxCreatedAt"
              AND m."id" <= c."readMaxMessageId"
            )
          )
      )
    )
  `;
}
