import { type ReactNode, type RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  CHAT_LIST_VIRTUAL_OVERSCAN,
  CHAT_LIST_VIRTUAL_THRESHOLD,
} from '@/utils/chatListConstants';

export type ChatListVirtualSliceProps<T> = {
  scrollElementRef: RefObject<HTMLDivElement | null>;
  items: readonly T[];
  getItemKey: (item: T, index: number) => string;
  estimateSizePx: number;
  overscan?: number;
  threshold?: number;
  renderItem: (item: T, index: number) => ReactNode;
};

type VirtualizedBodyProps<T> = Omit<ChatListVirtualSliceProps<T>, 'threshold'>;

function ChatListVirtualSliceVirtualized<T>({
  scrollElementRef,
  items,
  getItemKey,
  estimateSizePx,
  overscan = CHAT_LIST_VIRTUAL_OVERSCAN,
  renderItem,
}: VirtualizedBodyProps<T>) {
  const n = items.length;
  const virtualizer = useVirtualizer({
    count: n,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => estimateSizePx,
    overscan,
    getItemKey: (index) => getItemKey(items[index]!, index),
  });
  const rows = virtualizer.getVirtualItems();
  return (
    <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      {rows.map((row) => (
        <div
          key={row.key}
          data-index={row.index}
          ref={virtualizer.measureElement}
          className="absolute left-0 top-0 w-full"
          style={{ transform: `translateY(${row.start}px)` }}
        >
          {renderItem(items[row.index]!, row.index)}
        </div>
      ))}
    </div>
  );
}

export function ChatListVirtualSlice<T>({
  scrollElementRef,
  items,
  getItemKey,
  estimateSizePx,
  overscan,
  threshold = CHAT_LIST_VIRTUAL_THRESHOLD,
  renderItem,
}: ChatListVirtualSliceProps<T>) {
  const n = items.length;
  if (n < threshold) {
    return (
      <>
        {items.map((item, index) => (
          <div key={getItemKey(item, index)}>{renderItem(item, index)}</div>
        ))}
      </>
    );
  }
  return (
    <ChatListVirtualSliceVirtualized
      scrollElementRef={scrollElementRef}
      items={items}
      getItemKey={getItemKey}
      estimateSizePx={estimateSizePx}
      overscan={overscan}
      renderItem={renderItem}
    />
  );
}
