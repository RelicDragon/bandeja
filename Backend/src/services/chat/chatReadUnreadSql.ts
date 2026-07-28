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

/** Receipt rows only — ignores ChatReadCursor (used when writing receipts / backfill). */
export function sqlMessageMissingReceiptByUser(userId: string): Prisma.Sql {
  return Prisma.sql`
    NOT EXISTS (
      SELECT 1 FROM "MessageReadReceipt" r
      WHERE r."messageId" = m.id AND r."userId" = ${userId}
    )
  `;
}

/** Message sorts at or before (seq, createdAt, id) — same order as ChatReadCursor. */
export function sqlMessageAtOrBeforeCursor(args: {
  serverSyncSeq: number;
  createdAt: Date;
  messageId: string;
}): Prisma.Sql {
  const seq = args.serverSyncSeq;
  return Prisma.sql`
    (
      COALESCE(m."serverSyncSeq", -1) < ${seq}
      OR (
        COALESCE(m."serverSyncSeq", -1) = ${seq}
        AND m."createdAt" < ${args.createdAt}
      )
      OR (
        COALESCE(m."serverSyncSeq", -1) = ${seq}
        AND m."createdAt" = ${args.createdAt}
        AND m.id <= ${args.messageId}
      )
    )
  `;
}

/** Use a correlated column (e.g. Prisma.raw('recipient."userId"')) inside JOIN/VALUES batches. */
export function sqlMessageNotReadByViewerColumn(viewerColumnSql: Prisma.Sql): Prisma.Sql {
  return sqlMessageNotReadByViewer(viewerColumnSql);
}
