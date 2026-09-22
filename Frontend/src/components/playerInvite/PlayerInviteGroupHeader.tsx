import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

interface Props {
  label: string;
  count: number;
  icon?: LucideIcon;
}

/** Small-caps group heading inside the invite list (PRD 361). */
export function PlayerInviteGroupHeader({ label, count, icon: Icon }: Props) {
  const reduceMotion = usePrefersReducedMotion();
  const content = (
    <div
      role="heading"
      aria-level={3}
      data-testid="invite-group-header"
      className="flex items-center justify-between gap-2 px-2 pb-1 pt-3"
    >
      <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
        {Icon ? <Icon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden /> : null}
        <span className="min-w-0 break-words">{label}</span>
      </span>
      <span className="flex-shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-gray-500 dark:bg-gray-800 dark:text-gray-400">
        {count}
      </span>
    </div>
  );
  if (reduceMotion) return content;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, ease: 'easeOut' }}>
      {content}
    </motion.div>
  );
}
