import { type ReactNode, type RefObject, useMemo, useRef } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  CHAT_LIST_VIRTUAL_OVERSCAN,
  CHAT_LIST_VIRTUAL_THRESHOLD,
} from '@/utils/chatListConstants';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import {
  CHAT_LIST_HEIGHT_TRANSITION,
  CHAT_LIST_LAYOUT_SPRING,
  CHAT_ROW_EXIT_DURATION_S,
} from './chatListMotion';
import { ChatListAnimatedRow } from './ChatListAnimatedRow';
import { ChatListRowEnterShell } from './ChatListRowEnterShell';
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
  reduceMotion: boolean;
};

function ChatListVirtualSliceVirtualized<T>({
  scrollElementRef,
  items,
  getItemKey,
  estimateSizePx,
  overscan = CHAT_LIST_VIRTUAL_OVERSCAN,
  renderItem,
  newKeys,
  reduceMotion,
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
  const rowStyles = useVirtualRowLayoutTransition(scrollElementRef, rows, !reduceMotion);

  return (
    <motion.div
      className="relative w-full"
      initial={false}
      animate={{ height: totalHeight }}
      transition={reduceMotion ? { duration: 0 } : CHAT_LIST_HEIGHT_TRANSITION}
    >
      {rows.map((row) => {
        const itemKey = getItemKey(items[row.index]!, row.index);
        const isNew = newKeys.has(itemKey);
        const style = rowStyles.get(row.key) ?? { transform: `translateY(${row.start}px)` };
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
    </motion.div>
  );
}

function ChatListVirtualSliceStatic<T>({
  items,
  getItemKey,
  renderItem,
  reduceMotion,
  layoutGroupId,
}: {
  items: readonly T[];
  getItemKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  reduceMotion: boolean;
  layoutGroupId: string;
}) {
  if (reduceMotion) {
    return (
      <>
        {items.map((item, index) => (
          <div key={getItemKey(item, index)}>{renderItem(item, index)}</div>
        ))}
      </>
    );
  }

  return (
    <LayoutGroup id={layoutGroupId}>
      <AnimatePresence mode="popLayout">
        {items.map((item, index) => {
          const itemKey = getItemKey(item, index);
          return (
            <motion.div
              key={itemKey}
              layout
              layoutScroll
              className="overflow-hidden"
              exit={{ opacity: 0, scale: 0.96, transition: { duration: CHAT_ROW_EXIT_DURATION_S } }}
              transition={{ layout: CHAT_LIST_LAYOUT_SPRING }}
            >
              <ChatListRowEnterShell staggerIndex={index}>
                {renderItem(item, index)}
              </ChatListRowEnterShell>
            </motion.div>
          );
        })}
      </AnimatePresence>
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
  const getItemKeyRef = useRef(getItemKey);
  getItemKeyRef.current = getItemKey;
  const itemKeys = useMemo(
    () => items.map((item, index) => getItemKeyRef.current(item, index)),
    [items]
  );
  const newKeys = useChatListNewKeys(itemKeys, animationResetKey);
  const layoutGroupId = `chat-list-${animationResetKey ?? 'default'}`;
  const n = items.length;

  if (n < threshold) {
    return (
      <ChatListVirtualSliceStatic
        items={items}
        getItemKey={getItemKey}
        renderItem={renderItem}
        reduceMotion={reduceMotion}
        layoutGroupId={layoutGroupId}
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
      reduceMotion={reduceMotion}
    />
  );
}
