import type { ContentVariant } from './MessageContentBody';

export function getThreadSearchBubbleRingClass(isOwnMessage: boolean, isChannel: boolean): string {
  if (isOwnMessage && !isChannel) {
    return 'ring-2 ring-inset ring-blue-200/80 dark:ring-sky-200/60';
  }
  return 'ring-2 ring-inset ring-blue-500/55 dark:ring-sky-400/65';
}

export function getThreadSearchTextHighlightClass(variant: ContentVariant): string {
  const base = 'rounded-[2px] box-decoration-clone text-inherit';
  if (variant === 'own') {
    return `${base} bg-yellow-400/45 dark:bg-yellow-300/35`;
  }
  return `${base} bg-yellow-200/90 dark:bg-amber-400/45`;
}

export const THREAD_SEARCH_SYSTEM_TEXT_HIGHLIGHT_CLASS =
  'rounded-[2px] box-decoration-clone text-inherit bg-yellow-200/90 dark:bg-amber-400/45';
