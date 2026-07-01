import assert from 'node:assert/strict';
import type { Prisma } from '@prisma/client';
import { ChatContextType } from '@prisma/client';
import {
  notifyRecipientsOnMessageCreate,
  resolveMessageUnreadContext,
} from './messageCreateUnreadNotify.service';
import { setUnreadAuthorityDepsForTests } from './unreadAuthority/unreadAuthority.service';
import type { UnreadAuthorityEnvelope } from './unreadAuthority/types';

type FakeUnreadState = { userId: string; unreadRevision: number };
type FakeContextState = {
  userId: string;
  contextKey: string;
  contextType: string;
  contextId: string;
  unreadRevision: number;
};

function makeFakeTransactionClient(
  userRows: Map<string, FakeUnreadState>,
  contextRows: Map<string, FakeContextState>
): Prisma.TransactionClient {
  const rowKey = (userId: string, ck: string) => `${userId}::${ck}`;

  return {
    userUnreadState: {
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { userId: string };
        create: { userId: string; unreadRevision: number };
        update: { unreadRevision: { increment: number } };
        select: { unreadRevision: true };
      }) => {
        const existing = userRows.get(where.userId);
        if (!existing) {
          const row = { userId: create.userId, unreadRevision: create.unreadRevision };
          userRows.set(where.userId, row);
          return { unreadRevision: row.unreadRevision };
        }
        existing.unreadRevision += update.unreadRevision.increment;
        return { unreadRevision: existing.unreadRevision };
      },
    },
    userContextUnreadState: {
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { userId_contextKey: { userId: string; contextKey: string } };
        create: FakeContextState;
        update: {
          unreadRevision: { increment: number };
          contextType: string;
          contextId: string;
        };
        select: { unreadRevision: true };
      }) => {
        const key = rowKey(where.userId_contextKey.userId, where.userId_contextKey.contextKey);
        const existing = contextRows.get(key);
        if (!existing) {
          const row: FakeContextState = {
            userId: create.userId,
            contextKey: create.contextKey,
            contextType: create.contextType,
            contextId: create.contextId,
            unreadRevision: create.unreadRevision,
          };
          contextRows.set(key, row);
          return { unreadRevision: row.unreadRevision };
        }
        existing.unreadRevision += update.unreadRevision.increment;
        existing.contextType = update.contextType;
        existing.contextId = update.contextId;
        return { unreadRevision: existing.unreadRevision };
      },
    },
  } as unknown as Prisma.TransactionClient;
}

function fakeTransactionDeps() {
  const userRows = new Map<string, FakeUnreadState>();
  const contextRows = new Map<string, FakeContextState>();
  const tx = makeFakeTransactionClient(userRows, contextRows);
  return {
    transaction: async <T>(fn: (client: Prisma.TransactionClient) => Promise<T>) => fn(tx),
  };
}

async function testResolveMessageUnreadContext(): Promise<void> {
  assert.deepEqual(resolveMessageUnreadContext('GAME', 'game-1'), {
    contextKey: 'GAME:game-1',
    contextType: 'GAME',
    contextId: 'game-1',
  });
  assert.deepEqual(resolveMessageUnreadContext('USER', 'chat-1'), {
    contextKey: 'USER:chat-1',
    contextType: 'USER',
    contextId: 'chat-1',
  });
  assert.deepEqual(resolveMessageUnreadContext('GROUP', 'chan-1'), {
    contextKey: 'GROUP:chan-1',
    contextType: 'GROUP',
    contextId: 'chan-1',
  });

  const bugResolved = resolveMessageUnreadContext('BUG', 'bug-1', 'chan-bug');
  assert.equal(bugResolved?.contextKey, 'GROUP:chan-bug');
  assert.equal(bugResolved?.contextType, 'GROUP');
  assert.equal(bugResolved?.contextId, 'chan-bug');
  assert.equal(bugResolved?.groupChannelMeta?.bugId, 'bug-1');
  assert.equal(typeof bugResolved?.countAdapter, 'function');
  assert.equal(resolveMessageUnreadContext('BUG', 'bug-1', null), null);
}

async function testNotifyRecipientsPerRecipientEnvelope(): Promise<void> {
  const emitted: Array<{ userId: string; envelope: UnreadAuthorityEnvelope }> = [];
  let txCount = 0;

  setUnreadAuthorityDepsForTests({
    ...fakeTransactionDeps(),
    countAdapter: async () => 2,
    emitEnvelope: async (userId, envelope) => {
      txCount += 1;
      emitted.push({ userId, envelope });
    },
  });

  try {
    await notifyRecipientsOnMessageCreate({
      chatContextType: ChatContextType.USER,
      contextId: 'chat-1',
      senderId: 'sender',
      recipientIds: ['r1', 'r2', 'sender', 'r1'],
      lastMessage: { id: 'msg-1' },
    });

    assert.equal(txCount, 2);
    assert.deepEqual(
      emitted.map((e) => e.userId).sort(),
      ['r1', 'r2']
    );
    for (const { envelope } of emitted) {
      assert.equal(envelope.contextKey, 'USER:chat-1');
      assert.equal(envelope.reason, 'message_created');
      assert.equal(envelope.unreadCount, 2);
      assert.equal(envelope.lastMessage?.id, 'msg-1');
    }
  } finally {
    setUnreadAuthorityDepsForTests(undefined);
  }
}

async function testNotifyGameUsesAggregatedContextKey(): Promise<void> {
  const emitted: UnreadAuthorityEnvelope[] = [];

  setUnreadAuthorityDepsForTests({
    ...fakeTransactionDeps(),
    countAdapter: async () => 5,
    emitEnvelope: async (_userId, envelope) => {
      emitted.push(envelope);
    },
  });

  try {
    await notifyRecipientsOnMessageCreate({
      chatContextType: ChatContextType.GAME,
      contextId: 'game-9',
      senderId: 'sender',
      recipientIds: ['viewer'],
    });

    assert.equal(emitted.length, 1);
    assert.equal(emitted[0]?.contextKey, 'GAME:game-9');
    assert.equal(emitted[0]?.contextType, 'GAME');
    assert.equal(emitted[0]?.contextId, 'game-9');
    assert.equal(emitted[0]?.reason, 'message_created');
    assert.equal(emitted[0]?.unreadCount, 5);
  } finally {
    setUnreadAuthorityDepsForTests(undefined);
  }
}

async function main(): Promise<void> {
  await testResolveMessageUnreadContext();
  await testNotifyRecipientsPerRecipientEnvelope();
  await testNotifyGameUsesAggregatedContextKey();
  console.log('messageCreateUnreadNotify.test.ts: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
