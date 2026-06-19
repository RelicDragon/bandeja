import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { Loader2, WifiOff } from 'lucide-react';
import { CHAT_PANEL_TRANSITION } from '@/components/chat/chatListMotion';
import { PANEL_ENTER_Y, PANEL_EXIT_Y } from '@/components/motion/motionTokens';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

const statusShellClass =
  'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full';

const statusShellClassCompact =
  'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full';

export function GameChatHeaderStatusSlot({
  connectionState,
  statusTitle,
  paintHint,
  compact = false,
}: {
  connectionState: string;
  statusTitle?: string;
  paintHint?: string;
  compact?: boolean;
}) {
  const reduceMotion = usePrefersReducedMotion();
  const slotKey =
    connectionState === 'OFFLINE' ? 'offline' : connectionState === 'SYNCING' ? 'syncing' : 'none';

  const shellClass = compact ? statusShellClassCompact : statusShellClass;
  const iconSize = compact ? 12 : 22;
  const strokeWidth = compact ? 2.5 : 2;
  const containerSize = compact ? 'h-5 w-5' : 'h-10 w-10';
  const borderClass = compact
    ? 'border-2 border-white dark:border-gray-900 shadow-sm'
    : '';

  const node =
    connectionState === 'OFFLINE' ? (
      <div
        className={`${shellClass} ${borderClass} bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400`}
        role="status"
        title={paintHint ?? statusTitle}
        aria-label={statusTitle}
      >
        <WifiOff size={iconSize} strokeWidth={strokeWidth} />
      </div>
    ) : connectionState === 'SYNCING' ? (
      <div
        className={`${shellClass} ${borderClass} bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300`}
        role="status"
        title={paintHint ?? statusTitle}
        aria-label={statusTitle}
      >
        <Loader2 size={iconSize} className="animate-spin" strokeWidth={strokeWidth} />
      </div>
    ) : null;

  if (reduceMotion) {
    return node ?? <div className={containerSize} aria-hidden />;
  }

  return (
    <div className={`relative ${containerSize} flex-shrink-0`}>
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
