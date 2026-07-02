import assert from 'node:assert/strict';
import type { Prisma } from '@prisma/client';
import { bumpUnreadRevisions } from './revisionClocks';
import {
  UnreadAuthorityService,
  setUnreadAuthorityDepsForTests,
} from './unreadAuthority.service';
import type { UnreadAuthorityEnvelope } from './types';

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
  const contextKey = (userId: string, ck: string) => `${userId}::${ck}`;

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
        const key = contextKey(
          where.userId_contextKey.userId,
          where.userId_contextKey.contextKey
        );
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

async function testBumpUnreadRevisionsLazyInit(): Promise<void> {
  const userRows = new Map<string, FakeUnreadState>();
  const contextRows = new Map<string, FakeContextState>();
  const tx = makeFakeTransactionClient(userRows, contextRows);

  const first = await bumpUnreadRevisions(tx, {
    userId: 'u1',
    contextKey: 'USER:chat-1',
    contextType: 'USER',
    contextId: 'chat-1',
  });
  assert.deepEqual(first, { userUnreadRevision: 1, userContextUnreadRevision: 1 });

  const second = await bumpUnreadRevisions(tx, {
    userId: 'u1',
    contextKey: 'USER:chat-1',
    contextType: 'USER',
    contextId: 'chat-1',
  });
  assert.deepEqual(second, { userUnreadRevision: 2, userContextUnreadRevision: 2 });
}

async function testBumpUnreadRevisionsIndependentContexts(): Promise<void> {
  const userRows = new Map<string, FakeUnreadState>();
  const contextRows = new Map<string, FakeContextState>();
  const tx = makeFakeTransactionClient(userRows, contextRows);

  await bumpUnreadRevisions(tx, {
    userId: 'u1',
    contextKey: 'USER:chat-a',
    contextType: 'USER',
    contextId: 'chat-a',
  });
  const ctxB = await bumpUnreadRevisions(tx, {
    userId: 'u1',
    contextKey: 'USER:chat-b',
    contextType: 'USER',
    contextId: 'chat-b',
  });

  assert.equal(ctxB.userUnreadRevision, 2);
  assert.equal(ctxB.userContextUnreadRevision, 1);
}

async function testRecordContextChangedBuildsEnvelope(): Promise<void> {
  const userRows = new Map<string, FakeUnreadState>();
  const contextRows = new Map<string, FakeContextState>();
  const tx = makeFakeTransactionClient(userRows, contextRows);
  const emitted: UnreadAuthorityEnvelope[] = [];
  let readWriteRan = false;

  setUnreadAuthorityDepsForTests({
    transaction: async (fn) => fn(tx),
    countAdapter: async () => 4,
    emitEnvelope: async (_userId, envelope) => {
      emitted.push(envelope);
    },
  });

  try {
    const envelope = await UnreadAuthorityService.recordContextChanged({
      userId: 'u1',
      contextKey: 'GAME:game-1',
      contextType: 'GAME',
      contextId: 'game-1',
      reason: 'message_created',
      clientOpId: 'op-1',
      performReadWrite: async () => {
        readWriteRan = true;
      },
    });

    assert.equal(readWriteRan, true);
    assert.equal(envelope.unreadCount, 4);
    assert.equal(envelope.contextKey, 'GAME:game-1');
    assert.equal(envelope.clientOpId, 'op-1');
    assert.deepEqual(envelope.clock, { userUnreadRevision: 1, userContextUnreadRevision: 1 });
    assert.equal(emitted.length, 1);
    assert.deepEqual(emitted[0], envelope);
  } finally {
    setUnreadAuthorityDepsForTests(undefined);
  }
}

async function testRecordContextChangedEmitsAfterCommit(): Promise<void> {
  const userRows = new Map<string, FakeUnreadState>();
  const contextRows = new Map<string, FakeContextState>();
  const tx = makeFakeTransactionClient(userRows, contextRows);
  const order: string[] = [];

  setUnreadAuthorityDepsForTests({
    transaction: async (fn) => {
      order.push('tx-start');
      const result = await fn(tx);
      order.push('tx-commit');
      return result;
    },
    countAdapter: async () => {
      order.push('count');
      return 0;
    },
    emitEnvelope: async () => {
      order.push('emit');
    },
  });

  try {
    await UnreadAuthorityService.recordContextChanged({
      userId: 'u1',
      contextKey: 'USER:chat-1',
      contextType: 'USER',
      contextId: 'chat-1',
      reason: 'mark_context_read',
    });
    assert.deepEqual(order, ['tx-start', 'tx-commit', 'count', 'emit']);
  } finally {
    setUnreadAuthorityDepsForTests(undefined);
  }
}

async function testRecordContextChangedCountsOutsideTransaction(): Promise<void> {
  const userRows = new Map<string, FakeUnreadState>();
  const contextRows = new Map<string, FakeContextState>();
  const tx = makeFakeTransactionClient(userRows, contextRows);
  let inTransaction = false;

  setUnreadAuthorityDepsForTests({
    transaction: async (fn) => {
      inTransaction = true;
      const result = await fn(tx);
      inTransaction = false;
      return result;
    },
    countAdapter: async () => {
      assert.equal(inTransaction, false, 'unread count should not hold the transaction open');
      return 3;
    },
    emitEnvelope: async () => {},
  });

  try {
    const envelope = await UnreadAuthorityService.recordContextChanged({
      userId: 'u1',
      contextKey: 'GAME:game-1',
      contextType: 'GAME',
      contextId: 'game-1',
      reason: 'message_created',
    });
    assert.equal(envelope.unreadCount, 3);
  } finally {
    setUnreadAuthorityDepsForTests(undefined);
  }
}

async function testRecordContextChangedSkipsEmitOnRollback(): Promise<void> {
  const userRows = new Map<string, FakeUnreadState>();
  const contextRows = new Map<string, FakeContextState>();
  const tx = makeFakeTransactionClient(userRows, contextRows);
  let emitCalls = 0;

  setUnreadAuthorityDepsForTests({
    transaction: async (fn) => {
      try {
        await fn(tx);
        throw new Error('rollback');
      } catch (error) {
        throw error;
      }
    },
    countAdapter: async () => 1,
    emitEnvelope: async () => {
      emitCalls += 1;
    },
  });

  try {
    await assert.rejects(
      () =>
        UnreadAuthorityService.recordContextChanged({
          userId: 'u1',
          contextKey: 'USER:chat-1',
          contextType: 'USER',
          contextId: 'chat-1',
          reason: 'message_created',
        }),
      /rollback/
    );
    assert.equal(emitCalls, 0);
  } finally {
    setUnreadAuthorityDepsForTests(undefined);
  }
}

async function testRecordContextChangedRespectsEmitSocketFalse(): Promise<void> {
  const userRows = new Map<string, FakeUnreadState>();
  const contextRows = new Map<string, FakeContextState>();
  const tx = makeFakeTransactionClient(userRows, contextRows);
  let emitCalls = 0;

  setUnreadAuthorityDepsForTests({
    transaction: async (fn) => fn(tx),
    countAdapter: async () => 0,
    emitEnvelope: async () => {
      emitCalls += 1;
    },
  });

  try {
    await UnreadAuthorityService.recordContextChanged({
      userId: 'u1',
      contextKey: 'GROUP:chan-1',
      contextType: 'GROUP',
      contextId: 'chan-1',
      reason: 'mark_all_read',
      emitSocket: false,
    });
    assert.equal(emitCalls, 0);
  } finally {
    setUnreadAuthorityDepsForTests(undefined);
  }
}

async function testRecordContextChangedPerformReadWriteBeforeBump(): Promise<void> {
  const userRows = new Map<string, FakeUnreadState>();
  const contextRows = new Map<string, FakeContextState>();
  const tx = makeFakeTransactionClient(userRows, contextRows);

  setUnreadAuthorityDepsForTests({
    transaction: async (fn) => fn(tx),
    countAdapter: async () => 0,
    emitEnvelope: async () => {},
  });

  try {
    await UnreadAuthorityService.recordContextChanged({
      userId: 'u1',
      contextKey: 'USER:chat-1',
      contextType: 'USER',
      contextId: 'chat-1',
      reason: 'mark_context_read',
      performReadWrite: async () => {
        assert.equal(userRows.size, 0, 'read-write runs before user revision bump');
        assert.equal(contextRows.size, 0, 'read-write runs before context revision bump');
      },
    });
    assert.equal(userRows.get('u1')?.unreadRevision, 1);
  } finally {
    setUnreadAuthorityDepsForTests(undefined);
  }
}

async function main(): Promise<void> {
  await testBumpUnreadRevisionsLazyInit();
  await testBumpUnreadRevisionsIndependentContexts();
  await testRecordContextChangedBuildsEnvelope();
  await testRecordContextChangedPerformReadWriteBeforeBump();
  await testRecordContextChangedEmitsAfterCommit();
  await testRecordContextChangedCountsOutsideTransaction();
  await testRecordContextChangedSkipsEmitOnRollback();
  await testRecordContextChangedRespectsEmitSocketFalse();
  console.log('unreadAuthority.test.ts: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
