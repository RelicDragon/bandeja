import * as dotenv from 'dotenv';
import * as path from 'path';
import prisma from '../../src/config/database';
import { UnreadSnapshotService } from '../../src/services/chat/unreadSnapshot.service';
import { ReadReceiptService } from '../../src/services/chat/readReceipt.service';

dotenv.config({ path: path.join(__dirname, '../../.env') });

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    take: 2,
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (users.length < 2) {
    console.log('skip: need 2 users');
    return;
  }
  const [sender, reader] = users;

  const game = await prisma.game.findFirst({
    where: {
      status: { not: 'ARCHIVED' },
      participants: { some: { userId: reader.id, status: 'PLAYING' } },
    },
    select: { id: true },
  });
  if (!game) {
    console.log('skip: no game');
    return;
  }

  const max = await prisma.chatMessage.aggregate({
    where: { chatContextType: 'GAME', contextId: game.id, chatType: 'PUBLIC' },
    _max: { serverSyncSeq: true },
  });
  await prisma.chatMessage.create({
    data: {
      chatContextType: 'GAME',
      contextId: game.id,
      chatType: 'PUBLIC',
      senderId: sender.id,
      content: `[mark-all-atomicity] ${Date.now()}`,
      messageType: 'TEXT',
      serverSyncSeq: (max._max.serverSyncSeq ?? 0) + 1,
    },
  });

  const beforeRev =
    (await prisma.userUnreadState.findUnique({ where: { userId: reader.id } }))?.unreadRevision ?? 0;
  const beforeSnap = await UnreadSnapshotService.getSnapshot(reader.id);
  const gameUnread = (await ReadReceiptService.getGameUnreadCount(game.id, reader.id)).count;
  const ctxCount = Object.keys(beforeSnap.byContext).filter(
    (k) => (beforeSnap.byContext[k as keyof typeof beforeSnap.byContext] ?? 0) > 0
  ).length;
  if (ctxCount === 0 && gameUnread <= 0) {
    console.log('skip: no unread contexts');
    return;
  }

  const result = await UnreadSnapshotService.markAllAndSnapshot(reader.id);
  const afterRev =
    (await prisma.userUnreadState.findUnique({ where: { userId: reader.id } }))?.unreadRevision ?? 0;

  assert(afterRev - beforeRev === 1, `user revision must bump exactly once (${beforeRev}->${afterRev})`);
  assert(Object.keys(result.byContext).length === 0, 'byContext empty');
  assert(result.totals.all === 0, 'totals.all zero');
  assert(result.clock?.userUnreadRevision === afterRev, 'clock matches persisted revision');
  assert(
    (await ReadReceiptService.getGameUnreadCount(game.id, reader.id)).count === 0,
    'game unread zero after mark-all'
  );

  console.log(`ok: unread-mark-all-atomicity (contexts=${ctxCount}, rev ${beforeRev}->${afterRev})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
