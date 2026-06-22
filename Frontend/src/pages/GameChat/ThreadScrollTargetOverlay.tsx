import { AnimatePresence, motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

type ThreadScrollTargetOverlayProps = {
  active: boolean;
};

export function ThreadScrollTargetOverlay({ active }: ThreadScrollTargetOverlayProps) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();

  return (
    <AnimatePresence initial={false}>
      {active ? (
        <motion.div
          key="thread-scroll-target-overlay"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.18 }}
          className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-white/5 backdrop-blur-[1px] dark:bg-black/10"
          aria-live="polite"
          aria-busy="true"
        >
          <Loader2 size={28} className="animate-spin text-blue-500 dark:text-blue-400" aria-hidden />
          <span className="text-sm font-medium text-gray-700/90 dark:text-gray-200/90">
            {t('chat.goingToMessage')}
          </span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
