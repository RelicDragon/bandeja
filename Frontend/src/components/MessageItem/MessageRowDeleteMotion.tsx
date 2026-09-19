import { motion } from 'framer-motion';
import type { ReactNode, Ref } from 'react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import {
  CHAT_MESSAGE_ROW_EXIT,
  CHAT_MESSAGE_ROW_EXIT_TRANSITION,
} from '@/components/chat/chatListMotion';

type MessageRowDeleteMotionProps = {
  isDeleting: boolean;
  className: string;
  messageRef: Ref<HTMLDivElement>;
  children: ReactNode;
};

/**
 * Hoisted so the resting row (the overwhelming majority) hands Framer the same target and
 * transition objects on every render instead of two fresh literals per row per frame.
 */
const REST = { opacity: 1, scale: 1, y: 0 } as const;
const INSTANT = { duration: 0 } as const;

export function MessageRowDeleteMotion({
  isDeleting,
  className,
  messageRef,
  children,
}: MessageRowDeleteMotionProps) {
  const reduceMotion = usePrefersReducedMotion();

  // Stays a motion.div even at rest: `isDeleting` flips mid-life and swapping the element type
  // then would remount the row and cancel the exit animation it exists to play.
  return (
    <motion.div
      ref={messageRef}
      className={className}
      initial={false}
      animate={isDeleting && !reduceMotion ? CHAT_MESSAGE_ROW_EXIT : REST}
      transition={isDeleting ? CHAT_MESSAGE_ROW_EXIT_TRANSITION : INSTANT}
    >
      {children}
    </motion.div>
  );
}
