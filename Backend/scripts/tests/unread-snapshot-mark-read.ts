import * as dotenv from 'dotenv';
import * as path from 'path';
import { ChatType } from '@prisma/client';
import prisma from '../../src/config/database';
import { UnreadSnapshotService, buildByContextFromUnreadObjects, computeTotals, buildGroupChannelMeta } from '../../src/services/chat/unreadSnapshot.service';
import { UnreadObjectsService } from '../../src/services/chat/unreadObjects.service';
import { ReadReceiptService } from '../../src/services/chat/readReceipt.service';
import { UnreadCountBatchService } from '../../src/services/chat/unreadCountBatch.service';

dotenv.config({ path: path.join(__dirname, '../../.env') });

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

async function main() {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    take: 2,
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  assert(users.length >= 2, 'need at least 2 active users');
  const [sender, reader] = users;

  const game = await prisma.game.findFirst({
    where: {
      status: { not: 'ARCHIVED' },
      participants: { some: { userId: reader.id, status: 'PLAYING' } },
    },
    select: {
      id: true,
      status: true,
      participants: {
        where: { userId: reader.id },
        select: { status: true, role: true },
      },
    },
  });

  if (!game) {
    console.log('skip: no playing-participant game for reader');
    process.exit(0);
  }

  const gameId = game.id;
  const participant = game.participants[0];
  const chatTypes = UnreadCountBatchService.buildGameChatTypeFilter(
    participant,
    game.status
  );
  assert(chatTypes.includes('PUBLIC') && chatTypes.includes('PRIVATE'), 'filter includes PUBLIC+PRIVATE');

  await prisma.chatReadCursor.deleteMany({
    where: {
      userId: reader.id,
      chatContextType: 'GAME',
      contextId: gameId,
      chatType: { in: chatTypes as ChatType[] },
    },
  });

  async function nextSyncSeq(chatType: ChatType): Promise<number> {
    const max = await prisma.chatMessage.aggregate({
      where: { chatContextType: 'GAME', contextId: gameId, chatType },
      _max: { serverSyncSeq: true },
    });
    return (max._max.serverSyncSeq ?? 0) + 1;
  }

  const publicMsg = await prisma.chatMessage.create({
    data: {
      chatContextType: 'GAME',
      contextId: gameId,
      chatType: 'PUBLIC',
      senderId: sender.id,
      content: `[unread-test] public ${Date.now()}`,
      messageType: 'TEXT',
      serverSyncSeq: await nextSyncSeq('PUBLIC'),
    },
  });
  const privateMsg = await prisma.chatMessage.create({
    data: {
      chatContextType: 'GAME',
      contextId: gameId,
      chatType: 'PRIVATE',
      senderId: sender.id,
      content: `[unread-test] private ${Date.now()}`,
      messageType: 'TEXT',
      serverSyncSeq: await nextSyncSeq('PRIVATE'),
    },
  });

  try {
    const before = await ReadReceiptService.getGameUnreadCount(gameId, reader.id);
    assert(before.count >= 2, `expected >=2 unread before mark, got ${before.count}`);

    const snapshotBefore = await UnreadSnapshotService.getSnapshot(reader.id);
    const gameKey = `GAME:${gameId}` as const;
    assert(
      (snapshotBefore.byContext[gameKey] ?? 0) >= 2,
      `snapshot byContext game unread >= 2, got ${snapshotBefore.byContext[gameKey]}`
    );

    const sumGames = Object.entries(snapshotBefore.byContext)
      .filter(([k]) => k.startsWith('GAME:'))
      .reduce((s, [, n]) => s + n, 0);
    assert(
      snapshotBefore.totals.games === sumGames,
      `totals.games ${snapshotBefore.totals.games} !== sum GAME:* ${sumGames}`
    );

    const markResult = await UnreadSnapshotService.markContextRead(reader.id, {
      contextType: 'GAME',
      contextId: gameId,
      gameChatTypes: chatTypes as ChatType[],
    });
    assert(markResult.unreadCount === 0, 'mark-context unreadCount must be 0');
    assert(markResult.markedCount >= 2, `markedCount >= 2, got ${markResult.markedCount}`);

    const after = await ReadReceiptService.getGameUnreadCount(gameId, reader.id);
    assert(after.count === 0, `game unread after mark-context-read must be 0, got ${after.count}`);

    const snapshotAfter = await UnreadSnapshotService.getSnapshot(reader.id);
    assert(
      snapshotAfter.byContext[gameKey] === undefined || snapshotAfter.byContext[gameKey] === 0,
      'game key absent or zero after mark'
    );

    const publicMsg2 = await prisma.chatMessage.create({
      data: {
        chatContextType: 'GAME',
        contextId: gameId,
        chatType: 'PUBLIC',
        senderId: sender.id,
        content: `[unread-test] public2 ${Date.now()}`,
        messageType: 'TEXT',
        serverSyncSeq: await nextSyncSeq('PUBLIC'),
      },
    });

    const beforeAll = await UnreadSnapshotService.getSnapshot(reader.id);
    assert((beforeAll.byContext[gameKey] ?? 0) >= 1, 'unread restored before mark-all');

    const emptySnapshot = await UnreadSnapshotService.markAllAndSnapshot(reader.id);
    assert(emptySnapshot.totals.all === 0, 'mark-all totals.all must be 0');
    assert(Object.keys(emptySnapshot.byContext).length === 0, 'mark-all byContext empty');
    assert(emptySnapshot.games.length === 0, 'mark-all games array empty');

    const afterAll = await ReadReceiptService.getGameUnreadCount(gameId, reader.id);
    assert(afterAll.count === 0, 'game unread after mark-all must be 0');

    const totalsAll = await UnreadSnapshotService.getTotalsAll(reader.id);
    assert(typeof totalsAll === 'number', 'getTotalsAll returns number');

    const objects = await UnreadObjectsService.getUnreadObjects(reader.id);
    const byContext = buildByContextFromUnreadObjects(objects);
    const totals = computeTotals(byContext, { groupChannelMeta: buildGroupChannelMeta(objects) });
    assert(totals.all >= 0, 'computeTotals all >= 0');

    await prisma.messageReadReceipt.deleteMany({
      where: { messageId: { in: [publicMsg.id, privateMsg.id, publicMsg2.id] } },
    });
    await prisma.chatMessage.deleteMany({
      where: { id: { in: [publicMsg.id, privateMsg.id, publicMsg2.id] } },
    });

    console.log('ok: unread-snapshot-mark-read');
  } catch (e) {
    await prisma.messageReadReceipt.deleteMany({
      where: { messageId: { in: [publicMsg.id, privateMsg.id] } },
    }).catch(() => {});
    await prisma.chatMessage.deleteMany({
      where: { id: { in: [publicMsg.id, privateMsg.id] } },
    }).catch(() => {});
    throw e;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
