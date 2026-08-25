import { type ReactNode, type RefObject, useMemo, useRef } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  CHAT_LIST_VIRTUAL_OVERSCAN,
  CHAT_LIST_VIRTUAL_THRESHOLD,
} from '@/utils/chatListConstants';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { CHAT_LIST_LAYOUT_SPRING, CHAT_ROW_EXIT_DURATION_S } from './chatListMotion';
import { useChatListMotion } from './useChatListMotion';
import { ChatListAnimatedRow } from './ChatListAnimatedRow';
import { useChatListNewKeys } from './useChatListNewKeys';
import { useVirtualRowLayoutTransition } from './useVirtualRowLayoutTransition';

export type ChatListVirtualSliceProps<T> = {
  scrollElementRef: RefObject<HTMLDivElement | null>;
  items: readonly T[];
  getItemKey: (item: T, index: number) => string;
  estimateSizePx: number;
  overscan?: number;
  threshold?: number;
  animationResetKey?: string;
  renderItem: (item: T, index: number) => ReactNode;
};

type VirtualizedBodyProps<T> = Omit<ChatListVirtualSliceProps<T>, 'threshold'> & {
  newKeys: ReadonlySet<string>;
  allowListMotion: boolean;
};

function ChatListVirtualSliceVirtualized<T>({
  scrollElementRef,
  items,
  getItemKey,
  estimateSizePx,
  overscan = CHAT_LIST_VIRTUAL_OVERSCAN,
  renderItem,
  newKeys,
  allowListMotion,
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
  const totalHeight = virtualizer.getTotalSize();
  const rowStyles = useVirtualRowLayoutTransition(scrollElementRef, rows, allowListMotion);

  return (
    <div className="relative w-full" style={{ height: totalHeight }}>
      {rows.map((row) => {
        const itemKey = getItemKey(items[row.index]!, row.index);
        const isNew = newKeys.has(itemKey);
        const style = rowStyles.get(String(row.key)) ?? { transform: `translateY(${row.start}px)` };
        return (
          <div
            key={row.key}
            data-index={row.index}
            ref={virtualizer.measureElement}
            className="absolute left-0 top-0 w-full overflow-hidden will-change-transform"
            style={style}
          >
            <ChatListAnimatedRow isNew={isNew} staggerIndex={row.index}>
              {renderItem(items[row.index]!, row.index)}
            </ChatListAnimatedRow>
          </div>
        );
      })}
    </div>
  );
}

function ChatListVirtualSliceStatic<T>({
  items,
  getItemKey,
  renderItem,
  allowListMotion,
  layoutGroupId,
  newKeys,
}: {
  items: readonly T[];
  getItemKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  allowListMotion: boolean;
  layoutGroupId: string;
  newKeys: ReadonlySet<string>;
}) {
  const rows = items.map((item, index) => {
    const itemKey = getItemKey(item, index);
    const body = (
      <ChatListAnimatedRow isNew={newKeys.has(itemKey)} staggerIndex={index}>
        {renderItem(item, index)}
      </ChatListAnimatedRow>
    );

    if (!allowListMotion) {
      return <div key={itemKey}>{body}</div>;
    }

    return (
      <motion.div
        key={itemKey}
        layout
        layoutScroll
        className="overflow-hidden"
        exit={{ opacity: 0, scale: 0.96, transition: { duration: CHAT_ROW_EXIT_DURATION_S } }}
        transition={{ layout: CHAT_LIST_LAYOUT_SPRING }}
      >
        {body}
      </motion.div>
    );
  });

  if (!allowListMotion) {
    return <>{rows}</>;
  }

  return (
    <LayoutGroup id={layoutGroupId}>
      <AnimatePresence mode="popLayout">{rows}</AnimatePresence>
    </LayoutGroup>
  );
}

export function ChatListVirtualSlice<T>({
  scrollElementRef,
  items,
  getItemKey,
  estimateSizePx,
  overscan,
  threshold = CHAT_LIST_VIRTUAL_THRESHOLD,
  animationResetKey,
  renderItem,
}: ChatListVirtualSliceProps<T>) {
  const reduceMotion = usePrefersReducedMotion();
  const { listLoading, motionEnabled, networkSettled } = useChatListMotion();
  const allowListMotion = motionEnabled && !reduceMotion;
  const getItemKeyRef = useRef(getItemKey);
  getItemKeyRef.current = getItemKey;
  const itemKeys = useMemo(
    () => items.map((item, index) => getItemKeyRef.current(item, index)),
    [items]
  );
  const newKeys = useChatListNewKeys(itemKeys, animationResetKey, listLoading, networkSettled);
  const layoutGroupId = `chat-list-${animationResetKey ?? 'default'}`;
  const n = items.length;

  if (n < threshold) {
    return (
      <ChatListVirtualSliceStatic
        items={items}
        getItemKey={getItemKey}
        renderItem={renderItem}
        allowListMotion={allowListMotion}
        layoutGroupId={layoutGroupId}
        newKeys={newKeys}
      />
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
      newKeys={newKeys}
      allowListMotion={allowListMotion}
    />
  );
}
