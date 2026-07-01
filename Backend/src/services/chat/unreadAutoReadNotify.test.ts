import assert from 'node:assert/strict';
import { ChatContextType } from '@prisma/client';
import {
  AUTO_READ_NOTIFY_MAX_PAIRS,
  dedupeAutoReadAffected,
  UnreadAutoReadNotifyService,
} from './unreadAutoReadNotify.service';
import { ReadReceiptService } from './readReceipt.service';

function restoreGlobals(socketService: unknown): void {
  (global as { socketService?: unknown }).socketService = socketService;
}

async function testDedupeAutoReadAffected(): Promise<void> {
  const deduped = dedupeAutoReadAffected([
    { userId: 'u1', chatContextType: 'USER', contextId: 'c1' },
    { userId: 'u1', chatContextType: 'USER', contextId: 'c1' },
    { userId: 'u2', chatContextType: 'GAME', contextId: 'g1' },
  ]);
  assert.equal(deduped.length, 2);
}

async function testNotifySkipsWhenBatchTooLarge(): Promise<void> {
  const previous = (global as { socketService?: unknown }).socketService;
  let emitCalls = 0;
  (global as { socketService?: unknown }).socketService = {
    isUserOnline: () => true,
    emitUnreadCountUpdate: async () => {
      emitCalls += 1;
    },
  };

  try {
    const affected = Array.from({ length: AUTO_READ_NOTIFY_MAX_PAIRS + 1 }, (_, i) => ({
      userId: `user-${i}`,
      chatContextType: 'USER' as ChatContextType,
      contextId: `chat-${i}`,
    }));
    await UnreadAutoReadNotifyService.notifyOnlineUsers(affected);
    assert.equal(emitCalls, 0);
  } finally {
    restoreGlobals(previous);
  }
}

async function testNotifyEmitsForOnlineUsers(): Promise<void> {
  const previous = (global as { socketService?: unknown }).socketService;
  const emitted: Array<{ contextType: ChatContextType; contextId: string; userId: string; count: number }> = [];
  const originalGetCount = ReadReceiptService.getUnreadCountForContext;

  ReadReceiptService.getUnreadCountForContext = async (contextType, contextId, userId) => {
    if (contextType === 'USER' && contextId === 'chat-1' && userId === 'online-user') return 2;
    return 0;
  };

  (global as { socketService?: unknown }).socketService = {
    isUserOnline(userId: string) {
      return userId === 'online-user';
    },
    emitUnreadCountUpdate: async (
      contextType: ChatContextType,
      contextId: string,
      userId: string,
      unreadCount: number
    ) => {
      emitted.push({ contextType, contextId, userId, count: unreadCount });
    },
  };

  try {
    await UnreadAutoReadNotifyService.notifyOnlineUsers([
      { userId: 'online-user', chatContextType: 'USER', contextId: 'chat-1' },
      { userId: 'offline-user', chatContextType: 'USER', contextId: 'chat-2' },
    ]);
    assert.equal(emitted.length, 1);
    assert.deepEqual(emitted[0], {
      contextType: 'USER',
      contextId: 'chat-1',
      userId: 'online-user',
      count: 2,
    });
  } finally {
    ReadReceiptService.getUnreadCountForContext = originalGetCount;
    restoreGlobals(previous);
  }
}

async function main(): Promise<void> {
  await testDedupeAutoReadAffected();
  await testNotifySkipsWhenBatchTooLarge();
  await testNotifyEmitsForOnlineUsers();
  console.log('unreadAutoReadNotify.test.ts: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
