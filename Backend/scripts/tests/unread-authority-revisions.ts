import * as dotenv from 'dotenv';
import * as path from 'path';
import prisma from '../../src/config/database';
import { UnreadAuthority } from '../../src/services/chat/unreadAuthority';

dotenv.config({ path: path.join(__dirname, '../../.env') });

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const suffix = Date.now();
  const userA = await prisma.user.create({
    data: {
      email: `unread-authority-a-${suffix}@test.local`,
      firstName: 'Unread',
      lastName: 'A',
    },
    select: { id: true },
  });
  const userB = await prisma.user.create({
    data: {
      email: `unread-authority-b-${suffix}@test.local`,
      firstName: 'Unread',
      lastName: 'B',
    },
    select: { id: true },
  });

  try {
    const contextKey = `USER:test-chat-${suffix}`;
    const contextId = contextKey.slice('USER:'.length);

    const beforeUserRow = await prisma.userUnreadState.findUnique({ where: { userId: userA.id } });
    const beforeContextRow = await prisma.userContextUnreadState.findUnique({
      where: { userId_contextKey: { userId: userA.id, contextKey } },
    });
    assert(beforeUserRow == null, 'no user revision row before first write');
    assert(beforeContextRow == null, 'no context revision row before first write');

    const first = await UnreadAuthority.recordContextChanged({
      userId: userA.id,
      contextKey: contextKey as `USER:${string}`,
      contextType: 'USER',
      contextId,
      reason: 'message_created',
      emitSocket: false,
      countAdapter: async () => 3,
    });

    assert(first.clock.userUnreadRevision === 1, 'first user revision is 1');
    assert(first.clock.userContextUnreadRevision === 1, 'first context revision is 1');
    assert(first.unreadCount === 3, 'count from adapter');

    const userRow = await prisma.userUnreadState.findUnique({ where: { userId: userA.id } });
    assert(userRow?.unreadRevision === 1, 'user row persisted at revision 1');

    const contextRow = await prisma.userContextUnreadState.findUnique({
      where: { userId_contextKey: { userId: userA.id, contextKey } },
    });
    assert(contextRow?.unreadRevision === 1, 'context row persisted at revision 1');

    const second = await UnreadAuthority.recordContextChanged({
      userId: userA.id,
      contextKey: contextKey as `USER:${string}`,
      contextType: 'USER',
      contextId,
      reason: 'mark_context_read',
      emitSocket: false,
      countAdapter: async () => 0,
    });

    assert(second.clock.userUnreadRevision === 2, 'second user revision is 2');
    assert(second.clock.userContextUnreadRevision === 2, 'second context revision is 2');

    const otherContextKey = `GAME:game-${suffix}`;
    const third = await UnreadAuthority.recordContextChanged({
      userId: userA.id,
      contextKey: otherContextKey as `GAME:${string}`,
      contextType: 'GAME',
      contextId: otherContextKey.slice('GAME:'.length),
      reason: 'message_created',
      emitSocket: false,
      countAdapter: async () => 1,
    });

    assert(third.clock.userUnreadRevision === 3, 'user revision increments across contexts');
    assert(third.clock.userContextUnreadRevision === 1, 'new context starts at revision 1');

    const userBEnvelope = await UnreadAuthority.recordContextChanged({
      userId: userB.id,
      contextKey: contextKey as `USER:${string}`,
      contextType: 'USER',
      contextId,
      reason: 'message_created',
      emitSocket: false,
      countAdapter: async () => 2,
    });
    assert(userBEnvelope.clock.userUnreadRevision === 1, 'user B has independent user revision');
    assert(userBEnvelope.clock.userContextUnreadRevision === 1, 'user B has independent context revision');

    const userARowAfterB = await prisma.userUnreadState.findUnique({ where: { userId: userA.id } });
    assert(userARowAfterB?.unreadRevision === 3, 'user A revision unchanged by user B write');

    console.log('unread-authority-revisions: ok');
  } finally {
    await prisma.userContextUnreadState.deleteMany({
      where: { userId: { in: [userA.id, userB.id] } },
    });
    await prisma.userUnreadState.deleteMany({
      where: { userId: { in: [userA.id, userB.id] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
