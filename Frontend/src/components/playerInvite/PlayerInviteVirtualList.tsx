import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { InviteListRow } from '@/components/playerInvite/inviteListRows';
import { virtualRowOffset } from '@/components/playerInvite/virtualRowOffset';

const INLINE_THRESHOLD = 30;
const ROW_ESTIMATE = 88;
const ROW_GAP = 6;
const OVERSCAN = 6;

interface Props {
  /** Player, team and group-heading rows in display order. */
  rows: InviteListRow[];
  renderRow: (row: InviteListRow) => ReactNode;
  header?: ReactNode;
  empty?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function PlayerInviteVirtualList({
  rows,
  renderRow,
  header,
  empty,
  footer,
  className,
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const headerWrapRef = useRef<HTMLDivElement>(null);
  const hasHeader = Boolean(header);
  const useVirtual = rows.length >= INLINE_THRESHOLD;
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    if (!useVirtual || !hasHeader) {
      setScrollMargin(0);
      return;
    }
    const el = headerWrapRef.current;
    if (!el) {
      setScrollMargin(0);
      return;
    }
    const update = () => setScrollMargin(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [useVirtual, hasHeader]);

  const virtualizer = useVirtualizer({
    count: useVirtual ? rows.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_ESTIMATE,
    overscan: OVERSCAN,
    gap: ROW_GAP,
    scrollMargin,
    getItemKey: (index) => `${rows[index].kind}-${rows[index].id}`,
    enabled: useVirtual,
  });

  const headerNode = hasHeader ? <div ref={headerWrapRef}>{header}</div> : null;

  if (rows.length === 0) {
    return (
      <div ref={parentRef} className={className}>
        {headerNode}
        {empty}
        {footer}
      </div>
    );
  }

  if (!useVirtual) {
    return (
      <div ref={parentRef} className={className}>
        {headerNode}
        <div className="space-y-1.5 pb-2">
          {rows.map((row) => (
            <div key={`${row.kind}-${row.id}`}>{renderRow(row)}</div>
          ))}
        </div>
        {footer}
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  return (
    <div ref={parentRef} className={className}>
      {headerNode}
      <div
        style={{
          height: `${totalSize}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((row) => {
          const listRow = rows[row.index];
          return (
            <div
              key={row.key}
              data-index={row.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRowOffset(row.start, scrollMargin)}px)`,
              }}
            >
              {renderRow(listRow)}
            </div>
          );
        })}
      </div>
      {footer}
    </div>
  );
}
