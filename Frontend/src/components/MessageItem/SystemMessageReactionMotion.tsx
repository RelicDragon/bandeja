import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

type SystemMessageReactionMotionProps = {
  messageId: string;
  className?: string;
  suppressLayoutMotion?: boolean;
  children: ReactNode;
};

export function SystemMessageReactionMotion({
  messageId,
  className = '',
  suppressLayoutMotion = false,
  children,
}: SystemMessageReactionMotionProps) {
  const reduceMotion = usePrefersReducedMotion();
  const instant = suppressLayoutMotion || reduceMotion;

  return (
    <motion.div
      layoutId={`system-message-reactions-${messageId}`}
      layout
      transition={
        instant
          ? { layout: { duration: 0 } }
          : { layout: { type: 'spring', stiffness: 520, damping: 38, mass: 0.85 } }
      }
      className={className}
    >
      {children}
    </motion.div>
  );
}
