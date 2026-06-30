import { MessageCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

export type UnreadBadgeSize = 'sm' | 'md';

export interface UnreadBadgeProps {
  /** Unread count. Renders nothing when count <= 0. */
  count: number;
  /** 'sm' for dense chrome (nav, tabs, search, market, inline pills); 'md' for list rows, cards, avatar dots. */
  size?: UnreadBadgeSize;
  /** Render a chat icon before the count (inline row pills). */
  showIcon?: boolean;
  /** Extra classes from the parent — positioning, borders, shrink-0, etc. */
  className?: string;
}

const SIZE_CLASSES: Record<UnreadBadgeSize, string> = {
  sm: 'h-[18px] min-w-[18px] px-1 text-[10px]',
  md: 'h-5 min-w-[20px] px-1.5 text-xs',
};

/**
 * The single unread-count badge used everywhere in the app. Owns the `99+` cap,
 * the red-pill styling, and a uniform mount-pop (spring) that is skipped when the
 * user prefers reduced motion. Position the badge with `className`.
 */
export function UnreadBadge({ count, size = 'md', showIcon = false, className = '' }: UnreadBadgeProps) {
  const reduceMotion = usePrefersReducedMotion();
  if (count <= 0) return null;

  const label = count > 99 ? '99+' : count;
  const classes = `inline-flex items-center justify-center gap-0.5 rounded-full bg-red-500 font-semibold text-white tabular-nums ${SIZE_CLASSES[size]}${className ? ` ${className}` : ''}`;
  const icon = showIcon ? <MessageCircle size={10} strokeWidth={2.5} /> : null;

  if (reduceMotion) {
    return <span className={classes}>{icon}{label}</span>;
  }

  return (
    <motion.span
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 460, damping: 18 }}
      className={classes}
    >
      {icon}
      {label}
    </motion.span>
  );
}
