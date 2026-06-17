import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { Loader2, WifiOff } from 'lucide-react';
import { CHAT_PANEL_TRANSITION } from '@/components/chat/chatListMotion';
import { PANEL_ENTER_Y, PANEL_EXIT_Y } from '@/components/motion/motionTokens';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

const statusShellClass =
  'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full';

export function GameChatHeaderStatusSlot({
  connectionState,
  statusTitle,
  paintHint,
}: {
  connectionState: string;
  statusTitle?: string;
  paintHint?: string;
}) {
  const reduceMotion = usePrefersReducedMotion();
  const slotKey =
    connectionState === 'OFFLINE' ? 'offline' : connectionState === 'SYNCING' ? 'syncing' : 'none';

  const node =
    connectionState === 'OFFLINE' ? (
      <div
        className={`${statusShellClass} bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400`}
        role="status"
        title={paintHint ?? statusTitle}
        aria-label={statusTitle}
      >
        <WifiOff size={22} strokeWidth={2} />
      </div>
    ) : connectionState === 'SYNCING' ? (
      <div
        className={`${statusShellClass} bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300`}
        role="status"
        title={paintHint ?? statusTitle}
        aria-label={statusTitle}
      >
        <Loader2 size={22} className="animate-spin" strokeWidth={2} />
      </div>
    ) : null;

  if (reduceMotion) {
    return node ?? <div className="h-10 w-10 flex-shrink-0" aria-hidden />;
  }

  return (
    <div className="relative h-10 w-10 flex-shrink-0">
      <AnimatePresence initial={false}>
        {node ? (
          <motion.div
            key={slotKey}
            className="absolute inset-0"
            initial={{ opacity: 0, y: PANEL_ENTER_Y }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: PANEL_EXIT_Y }}
            transition={CHAT_PANEL_TRANSITION}
          >
            {node}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

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
