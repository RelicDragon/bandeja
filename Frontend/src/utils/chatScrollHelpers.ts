import type { RefObject } from 'react';

const BOTTOM_THRESHOLD_PX = 120;

export function getChatScrollContainer(chatContainerRef: RefObject<HTMLElement | null>): HTMLElement | null {
  return chatContainerRef.current?.querySelector('.overflow-y-auto') as HTMLElement | null;
}

export function isNearChatBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD_PX;
}

let scrollChatBottomRaf: number | null = null;

export function scrollChatToBottom(chatContainerRef: RefObject<HTMLElement | null>): void {
  if (scrollChatBottomRaf != null) cancelAnimationFrame(scrollChatBottomRaf);
  scrollChatBottomRaf = requestAnimationFrame(() => {
    scrollChatBottomRaf = null;
    const run = () => {
      const el = getChatScrollContainer(chatContainerRef);
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    };
    run();
    requestAnimationFrame(run);
  });
}

export function scrollChatToBottomIfNearBottom(chatContainerRef: RefObject<HTMLElement | null>): void {
  const el = getChatScrollContainer(chatContainerRef);
  if (!el || !isNearChatBottom(el)) return;
  scrollChatToBottom(chatContainerRef);
}
