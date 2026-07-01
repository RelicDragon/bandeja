import assert from 'node:assert/strict';
import type { Prisma } from '@prisma/client';
import { bumpUserRevisionOnly } from './revisionClocks';
import {
  MarkAllReadService,
  setMarkAllReadDepsForTests,
} from './markAllRead.service';
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
      findUnique: async ({ where }: { where: { userId: string } }) => {
        const row = userRows.get(where.userId);
        return row ? { unreadRevision: row.unreadRevision } : null;
      },
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

async function testBumpUserRevisionOnly(): Promise<void> {
  const userRows = new Map<string, FakeUnreadState>();
  const contextRows = new Map<string, FakeContextState>();
  const tx = makeFakeTransactionClient(userRows, contextRows);

  const first = await bumpUserRevisionOnly(tx, 'u1');
  assert.equal(first, 1);
  const second = await bumpUserRevisionOnly(tx, 'u1');
  assert.equal(second, 2);
}

async function testMarkAllReadSingleUserRevisionBump(): Promise<void> {
  const userRows = new Map<string, FakeUnreadState>();
  const contextRows = new Map<string, FakeContextState>();
  const tx = makeFakeTransactionClient(userRows, contextRows);
  const markReadOrder: string[] = [];
  const emitted: UnreadAuthorityEnvelope[] = [];

  setMarkAllReadDepsForTests({
    transaction: async (fn) => fn(tx),
    emitEnvelope: async (_userId, envelope) => {
      emitted.push(envelope);
    },
    emitInvalidation: async () => {
      throw new Error('unexpected invalidation');
    },
  });

  try {
    const result = await MarkAllReadService.recordMarkAllRead({
      userId: 'u1',
      contexts: [
        { contextKey: 'GAME:g1', contextType: 'GAME', contextId: 'g1' },
        { contextKey: 'USER:c1', contextType: 'USER', contextId: 'c1' },
        { contextKey: 'GROUP:ch1', contextType: 'GROUP', contextId: 'ch1' },
      ],
      performMarkRead: async (ctx) => {
        markReadOrder.push(ctx.contextKey);
      },
    });

    assert.deepEqual(markReadOrder, ['GAME:g1', 'USER:c1', 'GROUP:ch1']);
    assert.equal(result.userUnreadRevision, 1, 'user revision bumped once');
    assert.equal(result.contextRevisions['GAME:g1'], 1);
    assert.equal(result.contextRevisions['USER:c1'], 1);
    assert.equal(result.contextRevisions['GROUP:ch1'], 1);
    assert.equal(result.usedInvalidation, false);
    assert.equal(emitted.length, 3);
    for (const envelope of emitted) {
      assert.equal(envelope.unreadCount, 0);
      assert.equal(envelope.reason, 'mark_all_read');
      assert.equal(envelope.clock.userUnreadRevision, 1);
    }
    assert.equal(userRows.get('u1')?.unreadRevision, 1);
  } finally {
    setMarkAllReadDepsForTests(undefined);
  }
}

async function testMarkAllReadEmitsAfterMarkReads(): Promise<void> {
  const userRows = new Map<string, FakeUnreadState>();
  const contextRows = new Map<string, FakeContextState>();
  const tx = makeFakeTransactionClient(userRows, contextRows);
  const order: string[] = [];

  setMarkAllReadDepsForTests({
    transaction: async (fn) => {
      order.push('tx-start');
      const result = await fn(tx);
      order.push('tx-commit');
      return result;
    },
    emitEnvelope: async () => {
      order.push('emit');
    },
    emitInvalidation: async () => {},
  });

  try {
    await MarkAllReadService.recordMarkAllRead({
      userId: 'u1',
      contexts: [{ contextKey: 'USER:c1', contextType: 'USER', contextId: 'c1' }],
      performMarkRead: async () => {
        order.push('mark-read');
      },
    });
    assert.deepEqual(order, ['mark-read', 'tx-start', 'tx-commit', 'emit']);
  } finally {
    setMarkAllReadDepsForTests(undefined);
  }
}

async function testMarkAllReadSkipsEmitWhenMarkReadFails(): Promise<void> {
  const userRows = new Map<string, FakeUnreadState>();
  const contextRows = new Map<string, FakeContextState>();
  const tx = makeFakeTransactionClient(userRows, contextRows);
  let emitCalls = 0;

  setMarkAllReadDepsForTests({
    transaction: async (fn) => fn(tx),
    emitEnvelope: async () => {
      emitCalls += 1;
    },
    emitInvalidation: async () => {
      emitCalls += 1;
    },
  });

  try {
    await assert.rejects(
      () =>
        MarkAllReadService.recordMarkAllRead({
          userId: 'u1',
          contexts: [
            { contextKey: 'USER:c1', contextType: 'USER', contextId: 'c1' },
            { contextKey: 'USER:c2', contextType: 'USER', contextId: 'c2' },
          ],
          performMarkRead: async (ctx) => {
            if (ctx.contextId === 'c2') throw new Error('mark-read failed');
          },
        }),
      /mark-read failed/
    );
    assert.equal(emitCalls, 0);
    assert.equal(userRows.size, 0, 'no user revision bump on failure');
    assert.equal(contextRows.size, 0, 'no context revision bump on failure');
  } finally {
    setMarkAllReadDepsForTests(undefined);
  }
}

async function testMarkAllReadEmptyContexts(): Promise<void> {
  const userRows = new Map<string, FakeUnreadState>([['u1', { userId: 'u1', unreadRevision: 7 }]]);
  const contextRows = new Map<string, FakeContextState>();
  const tx = makeFakeTransactionClient(userRows, contextRows);
  let emitCalls = 0;

  setMarkAllReadDepsForTests({
    transaction: async (fn) => fn(tx),
    emitEnvelope: async () => {
      emitCalls += 1;
    },
    emitInvalidation: async () => {
      emitCalls += 1;
    },
  });

  try {
    const result = await MarkAllReadService.recordMarkAllRead({
      userId: 'u1',
      contexts: [],
      performMarkRead: async () => {},
    });
    assert.equal(result.userUnreadRevision, 7);
    assert.equal(emitCalls, 0);
    assert.equal(userRows.get('u1')?.unreadRevision, 7, 'no bump when nothing to clear');
  } finally {
    setMarkAllReadDepsForTests(undefined);
  }
}

async function testMarkAllReadUsesInvalidationAboveThreshold(): Promise<void> {
  const userRows = new Map<string, FakeUnreadState>();
  const contextRows = new Map<string, FakeContextState>();
  const tx = makeFakeTransactionClient(userRows, contextRows);
  let envelopeCalls = 0;
  let invalidationPayload: { userUnreadRevision: number; reason: string } | undefined;

  setMarkAllReadDepsForTests({
    transaction: async (fn) => fn(tx),
    emitEnvelope: async () => {
      envelopeCalls += 1;
    },
    emitInvalidation: async (_userId, payload) => {
      invalidationPayload = payload;
    },
  });

  try {
    const contexts = Array.from({ length: 201 }, (_, i) => ({
      contextKey: `USER:c-${i}` as `USER:${string}`,
      contextType: 'USER' as const,
      contextId: `c-${i}`,
    }));

    const result = await MarkAllReadService.recordMarkAllRead({
      userId: 'u1',
      contexts,
      performMarkRead: async () => {},
    });

    assert.equal(result.usedInvalidation, true);
    assert.equal(envelopeCalls, 0);
    assert.deepEqual(invalidationPayload, {
      userUnreadRevision: 1,
      reason: 'mark_all_read',
    });
  } finally {
    setMarkAllReadDepsForTests(undefined);
  }
}

async function main(): Promise<void> {
  await testBumpUserRevisionOnly();
  await testMarkAllReadSingleUserRevisionBump();
  await testMarkAllReadEmitsAfterMarkReads();
  await testMarkAllReadSkipsEmitWhenMarkReadFails();
  await testMarkAllReadEmptyContexts();
  await testMarkAllReadUsesInvalidationAboveThreshold();
  console.log('markAllRead.test.ts: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
