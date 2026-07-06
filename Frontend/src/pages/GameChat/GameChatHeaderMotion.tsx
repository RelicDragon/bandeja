import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { CHAT_PANEL_TRANSITION } from '@/components/chat/chatListMotion';
import { PANEL_ENTER_Y, PANEL_EXIT_Y } from '@/components/motion/motionTokens';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

export function GameChatHeaderChromeSwap({
  showLoading,
  loading,
  children,
  className,
}: {
  showLoading: boolean;
  loading: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const reduceMotion = usePrefersReducedMotion();

  if (reduceMotion) {
    return <div className={className}>{showLoading ? loading : children}</div>;
  }

  return (
    <div className={className}>
      <AnimatePresence initial={false} mode="popLayout">
        {showLoading ? (
          <motion.div
            key="header-loading"
            className="w-full"
            initial={{ opacity: 0, y: PANEL_ENTER_Y }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: PANEL_EXIT_Y }}
            transition={CHAT_PANEL_TRANSITION}
          >
            {loading}
          </motion.div>
        ) : (
          <motion.div
            key="header-loaded"
            className="w-full"
            initial={{ opacity: 0, y: PANEL_ENTER_Y }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: PANEL_EXIT_Y }}
            transition={CHAT_PANEL_TRANSITION}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function GameChatStatusBanner({
  show,
  children,
  className,
}: {
  show: boolean;
  children: ReactNode;
  className?: string;
}) {
  const reduceMotion = usePrefersReducedMotion();

  if (reduceMotion) {
    return show ? <div className={className}>{children}</div> : null;
  }

  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.div
          key="status-banner"
          className={className}
          initial={{ opacity: 0, y: PANEL_ENTER_Y }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: PANEL_EXIT_Y }}
          transition={CHAT_PANEL_TRANSITION}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
