import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { CONTENT_ENTER_Y, CONTENT_TRANSITION } from './motionTokens';

interface AnimatedChildrenStaggerProps {
  children: ReactNode;
  contentKey: string;
  className?: string;
}

export function AnimatedChildrenStagger({ children, contentKey, className }: AnimatedChildrenStaggerProps) {
  const reduceMotion = usePrefersReducedMotion();

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      key={contentKey}
      className={className}
      initial={{ opacity: 0, y: CONTENT_ENTER_Y }}
      animate={{ opacity: 1, y: 0 }}
      transition={CONTENT_TRANSITION}
    >
      {children}
    </motion.div>
  );
}
