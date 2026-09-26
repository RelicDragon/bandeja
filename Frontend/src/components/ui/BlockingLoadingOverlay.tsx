import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

type BlockingLoadingOverlayProps = {
  open: boolean;
  label: string;
};

/** Full-screen backdrop + spinner card that blocks input while a slow state switch runs. */
export function BlockingLoadingOverlay({ open, label }: BlockingLoadingOverlayProps) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="blocking-loading-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-white/75 dark:bg-gray-950/80 backdrop-blur-md"
          role="status"
          aria-live="polite"
          aria-busy
        >
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="mx-6 flex w-full max-w-sm items-center gap-3 rounded-2xl border border-gray-200/80 bg-white/95 p-6 shadow-xl dark:border-gray-700/80 dark:bg-gray-900/95"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600 ring-2 ring-primary-400/40 dark:bg-primary-900/40">
              <Loader2 size={18} className="animate-spin" />
            </div>
            <p className="text-base font-semibold text-gray-900 dark:text-white">{label}</p>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
