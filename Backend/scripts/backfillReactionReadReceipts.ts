import dotenv from 'dotenv';
dotenv.config();

import { Prisma } from '@prisma/client';
import prisma from '../src/config/database';
import { ChatReadCursorService } from '../src/services/chat/chatReadCursor.service';

type MissingReceiptRow = {
  messageId: string;
  userId: string;
  readAt: Date;
};

async function loadMissingReceipts(): Promise<MissingReceiptRow[]> {
  return prisma.$queryRaw<MissingReceiptRow[]>(Prisma.sql`
    SELECT
      r."messageId" AS "messageId",
      r."userId" AS "userId",
      r."createdAt" AS "readAt"
    FROM padelpulse."MessageReaction" r
    INNER JOIN padelpulse."ChatMessage" m ON m.id = r."messageId"
    WHERE m."deletedAt" IS NULL
      AND m."senderId" IS NOT NULL
      AND m."senderId" <> r."userId"
      AND NOT EXISTS (
        SELECT 1
        FROM padelpulse."MessageReadReceipt" rr
        WHERE rr."messageId" = r."messageId"
          AND rr."userId" = r."userId"
      )
    ORDER BY r."createdAt" ASC
  `);
}

async function backfill(dryRun: boolean): Promise<void> {
  const missing = await loadMissingReceipts();
  console.log(`Missing read receipts for reactions: ${missing.length}`);
  if (missing.length === 0) return;

  const messageIds = [...new Set(missing.map((row) => row.messageId))];
  const messages = await prisma.chatMessage.findMany({
    where: { id: { in: messageIds } },
    select: {
      id: true,
      chatContextType: true,
      contextId: true,
      chatType: true,
      serverSyncSeq: true,
      createdAt: true,
      senderId: true,
    },
  });
  const messageById = new Map(messages.map((message) => [message.id, message]));

  if (dryRun) {
    for (const row of missing.slice(0, 10)) {
      console.log('sample', row);
    }
    return;
  }

  let created = 0;
  await prisma.$transaction(
    async (tx) => {
      for (const row of missing) {
        const message = messageById.get(row.messageId);
        if (!message?.senderId || message.senderId === row.userId) continue;

        await tx.messageReadReceipt.create({
          data: {
            messageId: row.messageId,
            userId: row.userId,
            readAt: row.readAt,
          },
        });
        await ChatReadCursorService.mergeFromMessage(tx, row.userId, message);
        created += 1;
      }
    },
    { timeout: 120_000 }
  );

  const remaining = await loadMissingReceipts();
  console.log(`Created read receipts: ${created}`);
  console.log(`Remaining missing: ${remaining.length}`);
}

const dryRun = process.argv.includes('--dry-run');

backfill(dryRun)
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
