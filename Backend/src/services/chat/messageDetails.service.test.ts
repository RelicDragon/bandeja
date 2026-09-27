import assert from 'node:assert/strict';
import prisma from '../../config/database';
import { MessageService } from './message.service';

async function run() {
  const originalFind = prisma.chatReadCursor.findMany;
  const originalMessage = prisma.chatMessage.findFirst;
  const originalAccess = MessageService.validateMessageAccess;
  const originalUser = prisma.user.findUnique;
  const originalGame = prisma.game.findUnique;
  const originalFinalize = MessageService.finalizeMessageForClient;
  const message = {
    id: 'm1', chatContextType: 'GAME', contextId: 'game1', chatType: 'PRIVATE',
    serverSyncSeq: 7 as number | null, createdAt: new Date('2026-09-27T10:00:00Z'), senderId: 'sender',
    reactions: [{ userId: 'reactor', user: { id: 'reactor', firstName: 'Bob' } }], readReceipts: [],
  };
  let cursorQueries = 0;
  let permitted = true;
  prisma.chatMessage.findFirst = (async () => message) as unknown as typeof prisma.chatMessage.findFirst;
  MessageService.validateMessageAccess = async () => { if (!permitted) throw new Error('Denied'); };
  prisma.game.findUnique = (async () => ({ sport: 'PADEL' })) as unknown as typeof prisma.game.findUnique;
  prisma.user.findUnique = (async () => ({ language: 'en' })) as unknown as typeof prisma.user.findUnique;
  MessageService.finalizeMessageForClient = async (value) => value;
  prisma.chatReadCursor.findMany = (async (args: { where: unknown }) => {
    cursorQueries++;
    const seq = message.serverSyncSeq ?? -1;
    assert.deepEqual(args.where, {
      chatContextType: 'GAME', contextId: 'game1', chatType: 'PRIVATE',
      userId: { not: 'sender' },
      OR: [
        { readMaxServerSyncSeq: { gt: seq } },
        { readMaxServerSyncSeq: seq, readMaxCreatedAt: { gt: message.createdAt } },
        { readMaxServerSyncSeq: seq, readMaxCreatedAt: message.createdAt, readMaxMessageId: { gte: 'm1' } },
      ],
    });
    return [{ user: { id: 'reader', firstName: 'Alice' } }];
  }) as unknown as typeof prisma.chatReadCursor.findMany;
  try {
    const details = await MessageService.getMessageDetails('m1', 'viewer');
    assert.equal(details.readers[0].firstName, 'Alice', 'cursor reader is included with no legacy receipts');
    assert.equal(details.message.reactions[0].user.firstName, 'Bob');
    permitted = false;
    await assert.rejects(MessageService.getMessageDetails('m1', 'viewer'), /Denied/);
    assert.equal(cursorQueries, 1, 'access is checked before querying readers');
    permitted = true;
    message.serverSyncSeq = null;
    await MessageService.getMessageDetails('m1', 'viewer');
    assert.equal(cursorQueries, 2, 'legacy messages use the same cursor fallback as unread');
    console.log('messageDetails.service.test.ts: ok');
  } finally {
    prisma.chatReadCursor.findMany = originalFind;
    prisma.chatMessage.findFirst = originalMessage;
    MessageService.validateMessageAccess = originalAccess;
    prisma.user.findUnique = originalUser;
    prisma.game.findUnique = originalGame;
    MessageService.finalizeMessageForClient = originalFinalize;
  }
}
run().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
