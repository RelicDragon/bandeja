import { Prisma } from '@prisma/client';

function sqlMessageNotReadByViewer(viewerUserExpr: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`
    NOT (
      EXISTS (
        SELECT 1 FROM "MessageReadReceipt" r
        WHERE r."messageId" = m.id AND r."userId" = ${viewerUserExpr}
      )
      OR EXISTS (
        SELECT 1 FROM "ChatReadCursor" c
        WHERE c."userId" = ${viewerUserExpr}
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

export function sqlMessageNotReadByUser(userId: string): Prisma.Sql {
  return sqlMessageNotReadByViewer(Prisma.sql`${userId}`);
}

/** Use a correlated column (e.g. Prisma.raw('recipient."userId"')) inside JOIN/VALUES batches. */
export function sqlMessageNotReadByViewerColumn(viewerColumnSql: Prisma.Sql): Prisma.Sql {
  return sqlMessageNotReadByViewer(viewerColumnSql);
}
