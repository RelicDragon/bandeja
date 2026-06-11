import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components';

interface EmptyStateCardProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export const EmptyStateCard = ({
  icon: Icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateCardProps) => {
  return (
    <Card className={`relative overflow-hidden py-12 text-center ${className}`.trim()}>
      <div
        className="pointer-events-none absolute -top-20 left-1/2 h-52 w-52 -translate-x-1/2 rounded-full bg-primary-500/10 blur-3xl dark:bg-primary-400/10"
        aria-hidden
      />
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500/15 to-primary-600/5 ring-1 ring-primary-500/20 dark:from-primary-400/15 dark:to-primary-500/5 dark:ring-primary-400/20"
      >
        <Icon className="h-7 w-7 text-primary-600 dark:text-primary-400" strokeWidth={1.75} />
      </motion.div>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.08, ease: 'easeOut' }}
        className="relative text-base font-semibold text-gray-900 dark:text-white"
      >
        {title}
      </motion.p>
      {description && (
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.14, ease: 'easeOut' }}
          className="relative mx-auto mt-1.5 max-w-xs text-sm text-gray-500 dark:text-gray-400"
        >
          {description}
        </motion.p>
      )}
      {action && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.2, ease: 'easeOut' }}
          className="relative mt-5 flex justify-center"
        >
          {action}
        </motion.div>
      )}
    </Card>
  );
};
