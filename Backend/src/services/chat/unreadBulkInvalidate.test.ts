import assert from 'node:assert/strict';
import {
  bumpUserRevisionsAndEmitInvalidation,
  setUnreadBulkInvalidateDepsForTests,
} from './unreadBulkInvalidate.service';

async function testEmitsInvalidationForOnlineUsers(): Promise<void> {
  const emitted: Array<{ userId: string; userUnreadRevision: number; reason: string }> = [];
  let nextRevision = 0;

  setUnreadBulkInvalidateDepsForTests({
    transaction: async (fn) => {
      const tx = {
        userUnreadState: {
          upsert: async () => {
            nextRevision += 1;
            return { unreadRevision: nextRevision };
          },
        },
      };
      return fn(tx as never);
    },
    emitInvalidation: async (userId, payload) => {
      emitted.push({ userId, ...payload });
    },
    isUserOnline: (userId) => userId === 'online',
  });

  try {
    const revisions = await bumpUserRevisionsAndEmitInvalidation(['online', 'offline'], 'auto_read');
    assert.equal(revisions.size, 2);
    assert.equal(revisions.get('online'), 1);
    assert.equal(revisions.get('offline'), 2);
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0]?.userId, 'online');
    assert.equal(emitted[0]?.reason, 'auto_read');
    assert.equal(emitted[0]?.userUnreadRevision, 1);
  } finally {
    setUnreadBulkInvalidateDepsForTests(undefined);
  }
}

async function main(): Promise<void> {
  await testEmitsInvalidationForOnlineUsers();
  console.log('unreadBulkInvalidate.test.ts: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
