import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CHAT_PINNED_BAR_TRANSITION } from '@/components/chat/chatListMotion';
import { PinnedMessagesBar } from '@/components/chat/PinnedMessagesBar';
import { useThreadChrome, useThreadScroll } from './useThreadView';

interface GameChatPinnedBarProps {
  gameChatTabsVisible: boolean;
}

/** Pinned messages bar — chrome + scroll key only, not message list data. */
export const GameChatPinnedBar: React.FC<GameChatPinnedBarProps> = ({ gameChatTabsVisible }) => {
  const {
    pinnedMessages,
    pinnedMessagesOrdered,
    pinnedBarTopIndex,
    loadingScrollTargetId,
    handlePinnedBarClick,
    showLoadingHeader,
    panels,
    isThreadOpenSettling,
    isInitialLoad,
  } = useThreadChrome();
  const { threadScrollKey } = useThreadScroll();

  const pinnedBarSkipAnimationRef = useRef(true);
  const chromeSettling = isThreadOpenSettling || isInitialLoad;

  useEffect(() => {
    pinnedBarSkipAnimationRef.current = true;
  }, [threadScrollKey]);

  useEffect(() => {
    if (pinnedMessagesOrdered.length > 0 && pinnedBarSkipAnimationRef.current) {
      pinnedBarSkipAnimationRef.current = false;
    }
  }, [pinnedMessagesOrdered.length, threadScrollKey]);

  const pinnedBarAnimate = !pinnedBarSkipAnimationRef.current && !chromeSettling;
  const showPinnedBar =
    !showLoadingHeader &&
    pinnedMessagesOrdered.length > 0 &&
    !panels.showParticipantsPage &&
    !panels.showItemPage;

  return (
    <>
      <AnimatePresence>
        {showPinnedBar && (
          <motion.div
            key="pinned-bar"
            initial={pinnedBarAnimate ? { opacity: 0, maxHeight: 0 } : false}
            animate={{ opacity: 1, maxHeight: pinnedBarAnimate ? 80 : undefined }}
            exit={pinnedBarAnimate ? { opacity: 0, maxHeight: 0 } : undefined}
            transition={pinnedBarAnimate ? CHAT_PINNED_BAR_TRANSITION : { duration: 0 }}
            className={`${
              chromeSettling
                ? `absolute left-0 right-0 z-[2] ${gameChatTabsVisible ? 'top-12' : 'top-0'}`
                : 'relative'
            } overflow-hidden`}
          >
            <PinnedMessagesBar
              pinnedMessages={[pinnedMessagesOrdered[0]]}
              currentIndex={pinnedBarTopIndex + 1}
              totalCount={pinnedMessages.length}
              loadingScrollTargetId={loadingScrollTargetId}
              onItemClick={handlePinnedBarClick}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPinnedBar && !chromeSettling && (
          <motion.div
            key="pinned-shadow"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={CHAT_PINNED_BAR_TRANSITION}
            className="absolute top-0 left-0 right-0 z-[1] pointer-events-none"
          >
            <div
              className="h-4 w-full dark:hidden"
              style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.1), transparent)' }}
            />
            <div
              className="h-4 w-full hidden dark:block"
              style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.3), transparent)' }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
