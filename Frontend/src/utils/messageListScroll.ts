import type { Virtualizer } from '@tanstack/react-virtual';

/**
 * Bottom-pin via scrollTop — avoids @tanstack/virtual scrollToIndex, which can throw when
 * targetWindow is cleared during React re-layout (null.requestAnimationFrame).
 */
export function pinMessageListContainerToBottom(
  container: HTMLElement | null | undefined,
  opts?: { behavior?: ScrollBehavior }
): boolean {
  if (!container) return false;
  const top = Math.max(0, container.scrollHeight - container.clientHeight);
  if (opts?.behavior === 'smooth') {
    container.scrollTo({ top, behavior: 'smooth' });
  } else {
    container.scrollTop = top;
  }
  return true;
}

/** Re-pin over a few frames while row heights settle (e.g. after VIDEO bubble mount). */
export function pinMessageListContainerToBottomAfterLayout(
  getContainer: () => HTMLElement | null,
  framesLeft = 3
): void {
  requestAnimationFrame(() => {
    pinMessageListContainerToBottom(getContainer());
    if (framesLeft > 1) {
      pinMessageListContainerToBottomAfterLayout(getContainer, framesLeft - 1);
    }
  });
}

export function isMessageListNearBottom(container: HTMLElement | null, gapPx = 20): boolean {
  if (!container) return true;
  return container.scrollHeight - container.scrollTop - container.clientHeight <= gapPx;
}

type MessageListVirtualizer = Pick<
  Virtualizer<HTMLDivElement, Element>,
  'scrollToOffset' | 'getOffsetForIndex'
>;

/** scrollToIndex without TanStack's rAF verify loop (safe when targetWindow is torn down). */
export function scrollVirtualizerToIndex(
  virtualizer: MessageListVirtualizer,
  index: number,
  opts: { align?: 'start' | 'center' | 'end' | 'auto'; behavior?: ScrollBehavior } = {}
): void {
  const align = opts.align ?? 'auto';
  const info = virtualizer.getOffsetForIndex?.(index, align);
  if (info) {
    virtualizer.scrollToOffset(info[0], {
      align: info[1],
      behavior: opts.behavior ?? 'auto',
    } as NonNullable<Parameters<MessageListVirtualizer['scrollToOffset']>[1]>);
  }
}
