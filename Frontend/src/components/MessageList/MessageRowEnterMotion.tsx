import { motion } from 'framer-motion';
import { useRef, type ReactNode } from 'react';
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

const REST = { opacity: 1, x: 0, y: 0, scale: 1 } as const;

export function MessageRowEnterMotion({
  animate,
  staggerIndex,
  variant,
  children,
}: MessageRowEnterMotionProps) {
  const reduceMotion = usePrefersReducedMotion();
  const shouldAnimate = animate && !reduceMotion;

  // Latch the decision at mount. A row that mounts already-settled never needs Framer at all, and
  // on a full screen that is ~90 of ~90 rows. Latching (rather than branching on the live value)
  // keeps the element type stable: `animate` flips true → false when the enter animation is marked
  // seen, and swapping motion.div ↔ div at that moment would remount the row and drop media state.
  const usesMotionRef = useRef(shouldAnimate);

  if (!usesMotionRef.current) return <div>{children}</div>;

  const enterX = variant === 'outgoing' ? CHAT_MESSAGE_ENTER_X : -CHAT_MESSAGE_ENTER_X;

  return (
    <motion.div
      initial={
        shouldAnimate
          ? { opacity: 0, x: enterX, y: CHAT_MESSAGE_ENTER_Y, scale: 0.98 }
          : false
      }
      animate={REST}
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
