import { useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

const VIRTUALIZE_THRESHOLD = 40;
const ROW_ESTIMATE = 52;
const ROW_GAP = 6;
const OVERSCAN = 5;

export interface VirtualizedListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  estimateSize?: number;
  className?: string;
  contentClassName?: string;
  getItemKey?: (item: T, index: number) => string | number;
  scrollToIndex?: number | null;
  onScrolledToIndex?: () => void;
}

export function VirtualizedList<T>({
  items,
  renderItem,
  estimateSize = ROW_ESTIMATE,
  className = '',
  contentClassName = '',
  getItemKey,
  scrollToIndex,
  onScrolledToIndex,
}: VirtualizedListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: OVERSCAN,
    gap: ROW_GAP,
    getItemKey: getItemKey ? (index) => String(getItemKey(items[index], index)) : undefined,
  });
  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    if (scrollToIndex == null || scrollToIndex < 0 || scrollToIndex >= items.length) return;
    virtualizer.scrollToIndex(scrollToIndex, { align: 'center', behavior: 'smooth' });
    onScrolledToIndex?.();
  }, [scrollToIndex, items.length, virtualizer, onScrolledToIndex]);

  if (items.length === 0) return null;

  if (items.length < VIRTUALIZE_THRESHOLD) {
    return (
      <div ref={parentRef} className={className}>
        <div className={contentClassName}>
          {items.map((item, index) => (
            <div key={getItemKey ? getItemKey(item, index) : index}>{renderItem(item, index)}</div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={parentRef} className={className}>
      <div
        className={contentClassName}
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((row) => (
          <div
            key={row.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${row.start}px)`,
            }}
          >
            {renderItem(items[row.index], row.index)}
          </div>
        ))}
      </div>
    </div>
  );
}
