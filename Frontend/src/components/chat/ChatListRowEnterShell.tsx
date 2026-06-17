import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { CHAT_LIST_ROW_MOTION, chatListRowEnterDelay } from './chatListMotion';

type ChatListRowEnterShellProps = {
  staggerIndex: number;
  children: ReactNode;
  className?: string;
};

/** Clips enter translate/scale so intro motion does not inflate scroll overflow. */
export function ChatListRowEnterShell({
  staggerIndex,
  children,
  className = 'overflow-hidden',
}: ChatListRowEnterShellProps) {
  const delay = chatListRowEnterDelay(staggerIndex);

  return (
    <div className={className}>
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          opacity: { ...CHAT_LIST_ROW_MOTION.opacity, delay },
          y: { ...CHAT_LIST_ROW_MOTION.y, delay },
          scale: { ...CHAT_LIST_ROW_MOTION.scale, delay },
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}
