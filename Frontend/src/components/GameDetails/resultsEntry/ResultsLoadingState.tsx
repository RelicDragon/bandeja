import { motion } from 'framer-motion';

const SkeletonMatchCard = ({ delay }: { delay: number }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ type: 'spring', stiffness: 320, damping: 28, delay }}
    className="rounded-2xl border border-gray-200/80 bg-white p-3 shadow-sm dark:border-gray-700/70 dark:bg-gray-800"
  >
    <div className="animate-pulse space-y-3">
      <div className="h-3 w-16 rounded-md bg-gray-200 dark:bg-gray-700" />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-full bg-gray-200 dark:bg-gray-700" />
          <div className="h-3 w-20 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
        <div className="flex gap-1.5">
          <div className="h-10 w-10 rounded-xl bg-gray-200 dark:bg-gray-700" />
          <div className="h-10 w-10 rounded-xl bg-gray-100 dark:bg-gray-700/60" />
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-full bg-gray-200 dark:bg-gray-700" />
          <div className="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
        <div className="flex gap-1.5">
          <div className="h-10 w-10 rounded-xl bg-gray-100 dark:bg-gray-700/60" />
          <div className="h-10 w-10 rounded-xl bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>
    </div>
  </motion.div>
);

export const ResultsLoadingState = ({ label }: { label: string }) => (
  <div className="w-full space-y-3 py-4" role="status" aria-label={label}>
    <div className="flex justify-center">
      <div className="h-8 w-48 animate-pulse rounded-full bg-gray-200 dark:bg-gray-700" />
    </div>
    <SkeletonMatchCard delay={0.05} />
    <SkeletonMatchCard delay={0.12} />
    <p className="sr-only">{label}</p>
  </div>
);
