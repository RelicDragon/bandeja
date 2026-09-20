import { memo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

/**
 * PRD 349 — one score value that slides vertically when it changes.
 *
 * 200 ms, and only the digit that actually changed moves: the value is the
 * animation key, so an unchanged neighbour never re-enters. Under reduced
 * motion the new value simply replaces the old one with no transition.
 *
 * `tabular-nums` is mandatory here — without it the score block jitters
 * horizontally every time a digit changes width.
 */
interface LiveScoreDigitsProps {
  value: string;
  className?: string;
}

function LiveScoreDigitsView({ value, className = '' }: LiveScoreDigitsProps) {
  const reduceMotion = usePrefersReducedMotion();
  const classes = `inline-block tabular-nums ${className}`;

  if (reduceMotion) {
    return <span className={classes}>{value}</span>;
  }

  return (
    <span className={`relative inline-grid ${classes}`}>
      {/* An invisible copy holds the box size so the slide never reflows the row. */}
      <span className="invisible col-start-1 row-start-1" aria-hidden>
        {value}
      </span>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={value}
          className="col-start-1 row-start-1"
          initial={{ y: '-60%', opacity: 0 }}
          animate={{ y: '0%', opacity: 1 }}
          exit={{ y: '60%', opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export const LiveScoreDigits = memo(LiveScoreDigitsView);
