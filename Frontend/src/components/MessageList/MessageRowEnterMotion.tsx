import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import {
  CHAT_MESSAGE_ENTER_X,
  CHAT_MESSAGE_ENTER_Y,
  CHAT_MESSAGE_ROW_TRANSITION,
  chatListRowEnterDelay,
} from '@/components/chat/chatListMotion';

type MessageRowEnterMotionProps = {
  animate: boolean;
  staggerIndex: number;
  variant: 'incoming' | 'outgoing';
  children: ReactNode;
};

export function MessageRowEnterMotion({
  animate,
  staggerIndex,
  variant,
  children,
}: MessageRowEnterMotionProps) {
  const reduceMotion = usePrefersReducedMotion();
  const enterX = variant === 'outgoing' ? CHAT_MESSAGE_ENTER_X : -CHAT_MESSAGE_ENTER_X;
  const shouldAnimate = animate && !reduceMotion;

  return (
    <motion.div
      initial={
        shouldAnimate
          ? { opacity: 0, x: enterX, y: CHAT_MESSAGE_ENTER_Y, scale: 0.98 }
          : false
      }
      animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      transition={
        shouldAnimate
          ? {
              ...CHAT_MESSAGE_ROW_TRANSITION,
              delay: chatListRowEnterDelay(staggerIndex),
            }
          : { duration: 0 }
      }
    >
      {children}
    </motion.div>
  );
}
