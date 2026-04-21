import { useRef, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { InviteListEntry } from '@/components/playerInvite/inviteEntries';

const INLINE_THRESHOLD = 30;
const ROW_ESTIMATE = 76;
const ROW_GAP = 6;
const OVERSCAN = 6;

interface Props {
  entries: InviteListEntry[];
  renderEntry: (entry: InviteListEntry) => ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function PlayerInviteVirtualList({ entries, renderEntry, footer, className }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_ESTIMATE,
    overscan: OVERSCAN,
    gap: ROW_GAP,
    getItemKey: (index) => `${entries[index].kind}-${entries[index].id}`,
  });

  if (entries.length < INLINE_THRESHOLD) {
    return (
      <div ref={parentRef} className={className}>
        <div className="space-y-1.5 pb-2">
          {entries.map((e) => (
            <div key={`${e.kind}-${e.id}`}>{renderEntry(e)}</div>
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
      <div
        style={{
          height: `${totalSize}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((row) => {
          const entry = entries[row.index];
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
                transform: `translateY(${row.start}px)`,
              }}
            >
              {renderEntry(entry)}
            </div>
          );
        })}
      </div>
      {footer}
    </div>
  );
}
