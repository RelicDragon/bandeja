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

export function MessageRowDeleteMotion({
  isDeleting,
  className,
  messageRef,
  children,
}: MessageRowDeleteMotionProps) {
  const reduceMotion = usePrefersReducedMotion();

  return (
    <motion.div
      ref={messageRef}
      className={className}
      initial={false}
      animate={
        isDeleting && !reduceMotion ? CHAT_MESSAGE_ROW_EXIT : { opacity: 1, scale: 1, y: 0 }
      }
      transition={isDeleting ? CHAT_MESSAGE_ROW_EXIT_TRANSITION : { duration: 0 }}
    >
      {children}
    </motion.div>
  );
}
