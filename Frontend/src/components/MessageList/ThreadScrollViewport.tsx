import { forwardRef, useImperativeHandle, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { MessageListHandle } from './types';
import type {
  ThreadScrollViewportInput,
  ThreadScrollViewportRenderContext,
} from './threadScrollViewportTypes';
import { MessageListSettlingProvider } from './MessageListSettlingProvider';
import { useThreadScrollViewport } from './useThreadScrollViewport';

export type ThreadScrollViewportProps = ThreadScrollViewportInput & {
  hasContextPanel?: boolean;
  children: (ctx: ThreadScrollViewportRenderContext) => ReactNode;
};

export const ThreadScrollViewport = forwardRef<MessageListHandle, ThreadScrollViewportProps>(
  function ThreadScrollViewport({ children, hasContextPanel = false, ...input }, ref) {
    const viewport = useThreadScrollViewport(input);
    const { renderContext, containerRef, innerListRef, topLoadSentinelRef, imperativeHandle } =
      viewport;

    useImperativeHandle(ref, () => imperativeHandle, [imperativeHandle]);

    if (input.messages.length === 0) return null;

    return (
      <MessageListSettlingProvider value={viewport.settlingRefs}>
        <div
          ref={containerRef}
          className="thread-message-scroll relative flex-1 overflow-y-auto overflow-x-hidden scrollbar-auto p-4 min-h-0 overscroll-contain h-full"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
        {input.isSwitchingChatType ? (
          <div
            className="pointer-events-none absolute top-0 left-4 right-4 z-[2] h-1 rounded-full bg-primary-400/35 dark:bg-primary-500/25 animate-pulse"
            aria-hidden
          />
        ) : null}
        {hasContextPanel ? <div className="pt-6 flex-shrink-0" /> : null}
        <div
          ref={topLoadSentinelRef}
          className="w-full shrink-0 flex flex-col items-center justify-center min-h-[8px] py-2 pointer-events-none gap-2"
          aria-hidden
        >
          {input.isLoadingMore && input.hasMoreMessages ? (
            <div
              className="h-5 w-5 rounded-full border-2 border-gray-300 border-t-blue-500 dark:border-gray-600 dark:border-t-blue-400 animate-spin"
              role="status"
            />
          ) : null}
        </div>
        <motion.div
          ref={innerListRef}
          className="space-y-1 relative w-full"
          initial={false}
          animate={{ height: renderContext.totalHeight }}
          transition={renderContext.heightTransition}
        >
          {children(renderContext)}
        </motion.div>
        </div>
      </MessageListSettlingProvider>
    );
  }
);
