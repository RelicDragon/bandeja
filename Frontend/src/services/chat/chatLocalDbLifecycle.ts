import { chatLocalDb } from './chatLocalDb';
import { useChatSyncStore } from '@/store/chatSyncStore';

let registered = false;

export function initChatLocalDbLifecycle(): void {
  if (registered) return;
  registered = true;
  chatLocalDb.on('versionchange', () => {
    chatLocalDb.close();
    useChatSyncStore.getState().bumpChatListDexieBump();
  });
  chatLocalDb.on('blocked', () => {
    useChatSyncStore.getState().bumpChatListDexieBump();
  });
  chatLocalDb.open().catch((e: unknown) => {
    const name = e && typeof e === 'object' && 'name' in e ? String((e as { name: string }).name) : '';
    if (name === 'QuotaExceededError') {
      useChatSyncStore.getState().bumpChatListDexieBump();
    }
  });
}
