import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { courtFlipBounceOffset, courtFlipBounceTransition } from './liveCourtFlipMotion';

type CourtFlipBounceArrowProps = {
  axis: 'x' | 'y';
  /** Peak displacement away from the label (same convention as change-ends coach strip). */
  sign: 1 | -1;
  className?: string;
  children: ReactNode;
};

export function CourtFlipBounceArrow({ axis, sign, className, children }: CourtFlipBounceArrowProps) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) {
    return <span className={className}>{children}</span>;
  }
  const offset = courtFlipBounceOffset(axis, sign);
  return (
    <motion.span
      className={className}
      animate={axis === 'x' ? { x: offset } : { y: offset }}
      transition={courtFlipBounceTransition}
    >
      {children}
    </motion.span>
  );
}
