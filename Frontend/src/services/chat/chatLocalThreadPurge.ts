import type { ChatContextType } from '@/api/chat';
import { bridgeClearChatSyncTailState } from './chatLocalApplyStoreBridge';
import { chatCursorKey, chatLocalDb } from './chatLocalDb';
import { purgePeerReadCursorsForThread } from './peerReadCursorStore';

export async function purgeLocalDexieThread(contextType: ChatContextType, contextId: string): Promise<void> {
  const pair: [ChatContextType, string] = [contextType, contextId];
  const msgIds = await chatLocalDb.messages
    .where('[contextType+contextId]')
    .equals(pair)
    .primaryKeys();

  await chatLocalDb.transaction(
    'rw',
    [
      chatLocalDb.messages,
      chatLocalDb.threadIndex,
      chatLocalDb.messageContextHead,
      chatLocalDb.chatSyncCursor,
      chatLocalDb.chatThreads,
      chatLocalDb.threadScroll,
      chatLocalDb.peerReadCursors,
    ],
    async () => {
      await chatLocalDb.messages.bulkDelete(msgIds);
      const ti = await chatLocalDb.threadIndex.where('[contextType+contextId]').equals(pair).primaryKeys();
      await chatLocalDb.threadIndex.bulkDelete(ti);
      if (contextType === 'GAME') {
        const prefix = `GAME:${contextId}:`;
        const heads = await chatLocalDb.messageContextHead.filter((h) => h.key.startsWith(prefix)).toArray();
        for (const h of heads) await chatLocalDb.messageContextHead.delete(h.key);
        const scroll = await chatLocalDb.threadScroll.filter((r) => r.key.startsWith(prefix)).toArray();
        for (const r of scroll) await chatLocalDb.threadScroll.delete(r.key);
      } else {
        const k = `${contextType}:${contextId}`;
        await chatLocalDb.messageContextHead.delete(k);
        await chatLocalDb.threadScroll.delete(k);
      }
      await chatLocalDb.chatSyncCursor.delete(chatCursorKey(contextType, contextId));
      await chatLocalDb.chatThreads.delete(chatCursorKey(contextType, contextId));
      const peerPrefix = `${contextType}:${contextId}:`;
      const peerKeys = await chatLocalDb.peerReadCursors
        .filter((r) => r.threadKey.startsWith(peerPrefix) || r.threadKey === `${contextType}:${contextId}`)
        .primaryKeys();
      await chatLocalDb.peerReadCursors.bulkDelete(peerKeys);
    }
  );

  await purgePeerReadCursorsForThread(contextType, contextId);
  bridgeClearChatSyncTailState(contextType, contextId);
}
