import { bridgeBumpChatListDexie } from './chatLocalApplyStoreBridge';

let timer: ReturnType<typeof setTimeout> | null = null;

export function scheduleChatListOutboxBump(): void {
  if (typeof window === 'undefined') return;
  if (timer != null) return;
  timer = setTimeout(() => {
    timer = null;
    bridgeBumpChatListDexie();
  }, 120);
}
