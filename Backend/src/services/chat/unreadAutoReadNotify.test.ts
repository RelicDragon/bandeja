import assert from 'node:assert/strict';
import { ChatContextType } from '@prisma/client';
import {
  AUTO_READ_NOTIFY_MAX_PAIRS,
  dedupeAutoReadAffected,
  UnreadAutoReadNotifyService,
} from './unreadAutoReadNotify.service';
import { setUnreadBulkInvalidateDepsForTests } from './unreadBulkInvalidate.service';
import { setUnreadAuthorityDepsForTests } from './unreadAuthority/unreadAuthority.service';
import { setChatNotifierForTests, resetChatNotifierForTests, type ChatNotifier } from './chatNotifier';

function makeOnlineNotifier(onlineUserIds: Set<string>): ChatNotifier {
  return {
    emitChatEvent() {},
    recordMessageDelivery() {},
    async emitUnreadCountUpdate() {},
    async emitUnreadAuthorityEnvelope() {},
    async emitUnreadInvalidate() {},
    emitMessageTranslation() {},
    emitPinnedMessagesUpdated() {},
    getUndeliveredRecipients() {
      return [];
    },
    isUserOnline(userId) {
      return onlineUserIds.has(userId);
    },
    async isUserInChatRoom() {
      return false;
    },
    markSocketDelivered() {},
    markPushDelivered() {},
    emitMessageTranscription() {},
  };
}

async function testDedupeAutoReadAffected(): Promise<void> {
  const deduped = dedupeAutoReadAffected([
    { userId: 'u1', chatContextType: 'USER', contextId: 'c1' },
    { userId: 'u1', chatContextType: 'USER', contextId: 'c1' },
    { userId: 'u2', chatContextType: 'GAME', contextId: 'g1' },
  ]);
  assert.equal(deduped.length, 2);
}

async function testNotifyUsesInvalidationWhenBatchTooLarge(): Promise<void> {
  const invalidated: Array<{ userId: string; userUnreadRevision: number; reason: string }> = [];
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
      invalidated.push({ userId, ...payload });
    },
    isUserOnline: () => true,
  });

  try {
    const affected = Array.from({ length: AUTO_READ_NOTIFY_MAX_PAIRS + 1 }, (_, i) => ({
      userId: `user-${i}`,
      chatContextType: 'USER' as ChatContextType,
      contextId: `chat-${i}`,
    }));
    await UnreadAutoReadNotifyService.notifyOnlineUsers(affected);
    assert.equal(invalidated.length, AUTO_READ_NOTIFY_MAX_PAIRS + 1);
    assert.equal(invalidated[0]?.reason, 'auto_read');
  } finally {
    setUnreadBulkInvalidateDepsForTests(undefined);
  }
}

async function testNotifyEmitsAuthorityForOnlineUsers(): Promise<void> {
  const envelopes: Array<{ userId: string; contextKey: string; reason: string }> = [];
  const userRows = new Map<string, { userId: string; unreadRevision: number }>();
  const contextRows = new Map<
    string,
    { userId: string; contextKey: string; contextType: string; contextId: string; unreadRevision: number }
  >();

  setUnreadAuthorityDepsForTests({
    transaction: async (fn) => {
      const contextKey = (userId: string, ck: string) => `${userId}::${ck}`;
      const tx = {
        userUnreadState: {
          upsert: async ({
            where,
            create,
            update,
          }: {
            where: { userId: string };
            create: { userId: string; unreadRevision: number };
            update: { unreadRevision: { increment: number } };
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
            create: {
              userId: string;
              contextKey: string;
              contextType: string;
              contextId: string;
              unreadRevision: number;
            };
            update: { unreadRevision: { increment: number } };
          }) => {
            const key = contextKey(
              where.userId_contextKey.userId,
              where.userId_contextKey.contextKey
            );
            const existing = contextRows.get(key);
            if (!existing) {
              const row = {
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
            return { unreadRevision: existing.unreadRevision };
          },
        },
      };
      return fn(tx as never);
    },
    countAdapter: async () => 2,
    emitEnvelope: async (userId, envelope) => {
      envelopes.push({ userId, contextKey: envelope.contextKey, reason: envelope.reason });
    },
  });
  setChatNotifierForTests(makeOnlineNotifier(new Set(['online-user'])));

  try {
    await UnreadAutoReadNotifyService.notifyOnlineUsers([
      { userId: 'online-user', chatContextType: 'USER', contextId: 'chat-1' },
      { userId: 'offline-user', chatContextType: 'USER', contextId: 'chat-2' },
    ]);
    assert.equal(envelopes.length, 1);
    assert.deepEqual(envelopes[0], {
      userId: 'online-user',
      contextKey: 'USER:chat-1',
      reason: 'auto_read',
    });
  } finally {
    setUnreadAuthorityDepsForTests(undefined);
    resetChatNotifierForTests();
  }
}

async function main(): Promise<void> {
  await testDedupeAutoReadAffected();
  await testNotifyUsesInvalidationWhenBatchTooLarge();
  await testNotifyEmitsAuthorityForOnlineUsers();
  console.log('unreadAutoReadNotify.test.ts: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
