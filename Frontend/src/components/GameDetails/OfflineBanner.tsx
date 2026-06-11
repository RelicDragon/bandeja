import { WifiOff, RefreshCw, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface OfflineBannerProps {
  serverProblem: boolean;
  showMessage: boolean;
  onToggle: () => void;
  onSync: () => void;
  isSyncing: boolean;
}

export const OfflineBanner = ({
  serverProblem,
  showMessage,
  onToggle,
  onSync,
  isSyncing,
}: OfflineBannerProps) => {
  const { t } = useTranslation();

  if (!serverProblem) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      className="overflow-hidden rounded-2xl border border-amber-300/80 bg-gradient-to-br from-amber-50 via-amber-100/60 to-orange-50 shadow-sm shadow-amber-500/10 dark:border-amber-700/60 dark:from-amber-950/40 dark:via-amber-900/25 dark:to-orange-950/30"
    >
      <button
        type="button"
        className="flex w-full items-center justify-center gap-2.5 px-4 pt-4 pb-2"
        onClick={onToggle}
      >
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-200/80 dark:bg-amber-800/50">
          <span className="absolute inset-0 animate-ping rounded-full bg-amber-400/30" />
          <WifiOff size={16} className="relative text-amber-800 dark:text-amber-200" />
        </span>
        <span className="text-sm font-semibold text-amber-900 dark:text-amber-100">
          {t('offline.noInternetConnection')}
        </span>
        <motion.span
          animate={{ rotate: showMessage ? 180 : 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 24 }}
          className="text-amber-700 dark:text-amber-300"
        >
          <ChevronDown size={16} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {showMessage && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'tween', duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
          >
            <p className="px-5 pb-2 text-center text-xs leading-relaxed text-amber-800/90 dark:text-amber-200/90">
              {t('offline.offlineEditingMessage')}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="px-4 pb-4 pt-1">
        <motion.button
          onClick={(e) => {
            e.stopPropagation();
            onSync();
          }}
          disabled={isSyncing}
          whileTap={isSyncing ? undefined : { scale: 0.98 }}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-amber-500/25 transition-all hover:from-amber-600 hover:to-orange-600 hover:shadow-lg hover:shadow-amber-500/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
          {isSyncing ? t('common.loading') : (t('gameResults.syncToServer') || 'Sync to Server')}
        </motion.button>
      </div>
    </motion.div>
  );
};
