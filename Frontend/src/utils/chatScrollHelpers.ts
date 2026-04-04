import type { RefObject } from 'react';

const BOTTOM_THRESHOLD_PX = 120;

export function getChatScrollContainer(chatContainerRef: RefObject<HTMLElement | null>): HTMLElement | null {
  return chatContainerRef.current?.querySelector('.overflow-y-auto') as HTMLElement | null;
}

export function isNearChatBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD_PX;
}

export function scrollChatToBottom(chatContainerRef: RefObject<HTMLElement | null>): void {
  const el = getChatScrollContainer(chatContainerRef);
  if (!el) return;
  const run = () => {
    el.scrollTop = el.scrollHeight;
  };
  requestAnimationFrame(() => {
    run();
    setTimeout(run, 50);
    setTimeout(run, 150);
  });
}

export function scrollChatToBottomIfNearBottom(chatContainerRef: RefObject<HTMLElement | null>): void {
  const el = getChatScrollContainer(chatContainerRef);
  if (!el || !isNearChatBottom(el)) return;
  scrollChatToBottom(chatContainerRef);
}
