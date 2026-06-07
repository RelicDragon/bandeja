import { chatLocalDb } from './chatLocalDb';
import { bridgeBumpChatListDexie } from './chatLocalApplyStoreBridge';

let registered = false;

export function initChatLocalDbLifecycle(): void {
  if (registered) return;
  registered = true;
  chatLocalDb.on('versionchange', () => {
    chatLocalDb.close();
    bridgeBumpChatListDexie();
  });
  chatLocalDb.on('blocked', () => {
    bridgeBumpChatListDexie();
  });
  chatLocalDb.open().catch((e: unknown) => {
    const name = e && typeof e === 'object' && 'name' in e ? String((e as { name: string }).name) : '';
    if (name === 'QuotaExceededError') {
      bridgeBumpChatListDexie();
    }
  });
}
