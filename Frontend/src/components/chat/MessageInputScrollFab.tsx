import React, { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { CHAT_FAB_EXIT_TRANSITION, CHAT_FAB_SPRING } from '@/components/chat/chatListMotion';
import { useThreadScroll } from '@/pages/GameChat/useThreadView';
import { composerFabButtonClass } from './TranslateToButton';

const scrollToBottomFabMotion = {
  initial: { opacity: 0, y: 40, scale: 0.72 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: CHAT_FAB_SPRING,
  },
  exit: {
    opacity: 0,
    y: 0,
    scale: 1,
    transition: CHAT_FAB_EXIT_TRANSITION,
  },
};

/** Subscribes only to scroll seam — parent composer stays isolated from near-bottom toggles. */
export const MessageInputScrollFab: React.FC = () => {
  const { t } = useTranslation();
  const { subscribeChatNearBottom, getChatNearBottom, scrollToBottomSmooth } = useThreadScroll();
  const chatNearBottom = useSyncExternalStore(subscribeChatNearBottom, getChatNearBottom);

  return (
    <AnimatePresence>
      {!chatNearBottom ? (
        <motion.div
          key="chat-scroll-to-bottom"
          className="flex flex-shrink-0"
          initial={scrollToBottomFabMotion.initial}
          animate={scrollToBottomFabMotion.animate}
          exit={scrollToBottomFabMotion.exit}
        >
          <motion.button
            type="button"
            onClick={scrollToBottomSmooth}
            className={`${composerFabButtonClass} origin-bottom-right`}
            title={t('chat.scrollToBottom', { defaultValue: 'Scroll to latest' })}
            aria-label={t('chat.scrollToBottom', { defaultValue: 'Scroll to latest' })}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 500, damping: 28 }}
          >
            <motion.span
              className="flex items-center justify-center"
              initial={{ y: -4, opacity: 0.6 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 18, delay: 0.08 }}
            >
              <ChevronDown size={24} strokeWidth={2.25} className="text-gray-700 dark:text-gray-300" aria-hidden />
            </motion.span>
          </motion.button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
