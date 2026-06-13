import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type CreateGameProgressPhase = 'creating' | 'success';

type CreateGameProgressOverlayProps = {
  phase: CreateGameProgressPhase | null;
};

export function CreateGameProgressOverlay({ phase }: CreateGameProgressOverlayProps) {
  const { t } = useTranslation();

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {phase ? (
        <motion.div
          key="create-game-progress"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-white/75 dark:bg-gray-950/80 backdrop-blur-md"
          aria-live="polite"
          aria-busy={phase === 'creating'}
        >
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.25 }}
            className="mx-6 w-full max-w-sm rounded-2xl border border-gray-200/80 bg-white/95 p-6 shadow-xl dark:border-gray-700/80 dark:bg-gray-900/95"
          >
            {phase === 'creating' ? (
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600 ring-2 ring-primary-400/40 dark:bg-primary-900/40">
                  <Loader2 size={18} className="animate-spin" />
                </div>
                <div>
                  <p className="text-base font-semibold text-gray-900 dark:text-white">
                    {t('createGame.booktime.activityTitle')}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t('createGame.booktime.activityStep2')}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center py-2 text-center">
                <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                  <Check size={32} className="text-green-600 dark:text-green-400" />
                </div>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('createGame.booktime.successTitle')}
                </p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {t('createGame.booktime.successBody')}
                </p>
              </div>
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
