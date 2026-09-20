import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

/**
 * PRD 349 — the red "● LIVE" dot.
 *
 * Decorative: it repeats what the adjacent "Live now" label already says, so it
 * is `aria-hidden` and carries no text alternative of its own.
 *
 * Breathing opacity over 2 s; completely static under reduced motion. This is
 * the only looping animation on the rail — the score digit slide and the
 * leading-side glow are both one-shot, so no more than one hero element ever
 * animates at a time.
 */
export function LiveDot({ className = '' }: { className?: string }) {
  const reduceMotion = usePrefersReducedMotion();
  const base = `inline-block h-2 w-2 shrink-0 rounded-full bg-red-500 ${className}`;

  if (reduceMotion) {
    return <span className={base} aria-hidden />;
  }

  return (
    <motion.span
      className={base}
      aria-hidden
      animate={{ opacity: [1, 0.35, 1] }}
      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}
