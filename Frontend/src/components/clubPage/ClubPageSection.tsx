import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

type ClubPageSectionProps = {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * PRD 354 — one club-page section, revealed once on first scroll with a 12 px
 * lift. `viewport.once` keeps it from re-animating on every scroll pass, and
 * reduced motion renders the final state immediately.
 */
export function ClubPageSection({ title, action, children, className = '' }: ClubPageSectionProps) {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <motion.section
      initial={reducedMotion ? false : { opacity: 0, y: 12 }}
      whileInView={reducedMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      className={`space-y-3 ${className}`.trim()}
    >
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 px-1">
          {title ? (
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
          ) : (
            <span />
          )}
          {action}
        </div>
      )}
      {children}
    </motion.section>
  );
}
