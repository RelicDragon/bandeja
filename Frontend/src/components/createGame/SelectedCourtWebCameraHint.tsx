import { memo, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ExternalLink, Video } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CourtDisplayName } from '@/components/CourtDisplayName';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { openExternalUrl } from '@/utils/openExternalUrl';
import type { Court } from '@/types';

interface SelectedCourtWebCameraHintProps {
  courts: Court[];
  selectedCourtIds: string[];
}

export const SelectedCourtWebCameraHint = memo(function SelectedCourtWebCameraHint({
  courts,
  selectedCourtIds,
}: SelectedCourtWebCameraHintProps) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const collapseTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.24, ease: [0.21, 0.47, 0.32, 0.98] as const };
  const itemTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.2, ease: 'easeInOut' as const };

  const visibleCourts = useMemo(
    () =>
      selectedCourtIds
        .map((id) => courts.find((court) => court.id === id))
        .filter((court): court is Court => Boolean(court?.webCameraUrl?.trim())),
    [courts, selectedCourtIds],
  );
  const visible = visibleCourts.length > 0;

  return (
    <motion.div
      initial={false}
      animate={{
        gridTemplateRows: visible ? '1fr' : '0fr',
        opacity: visible ? 1 : 0,
        marginTop: visible ? 6 : 0,
      }}
      transition={collapseTransition}
      className="grid min-h-0"
    >
      <div className="overflow-hidden min-h-0">
        <div className="space-y-1.5">
          {visibleCourts.length > 1 ? (
            <p className="px-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {t('createGame.webCameraHintsTitle')}
            </p>
          ) : null}
          <AnimatePresence initial={false} mode="popLayout">
            {visibleCourts.map((court) => {
              const url = court.webCameraUrl!.trim();

              return (
                <motion.div
                  key={court.id}
                  layout={!reduceMotion}
                  initial={{ opacity: 0, height: 0, y: -6 }}
                  animate={{ opacity: 1, height: 'auto', y: 0 }}
                  exit={{ opacity: 0, height: 0, y: -4 }}
                  transition={itemTransition}
                  className="overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => void openExternalUrl(url)}
                    className="group flex w-full items-center gap-3 rounded-xl border border-primary-200/70 bg-gradient-to-r from-primary-50/90 via-white to-violet-50/70 px-3 py-2.5 text-left shadow-sm transition-[border-color,box-shadow,transform] hover:border-primary-300 hover:shadow-md active:scale-[0.99] dark:border-primary-800/45 dark:from-primary-950/35 dark:via-gray-900/40 dark:to-violet-950/25 dark:hover:border-primary-700/60"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-600 ring-1 ring-primary-200/60 dark:bg-primary-900/45 dark:text-primary-400 dark:ring-primary-800/50">
                      <Video size={17} strokeWidth={2.25} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <CourtDisplayName
                        name={court.name}
                        integrationName={court.integrationCourtName}
                        primaryClassName="block truncate text-xs font-semibold text-gray-900 dark:text-white"
                        secondaryClassName="block truncate text-[10px] font-normal text-gray-500 dark:text-gray-400"
                        className="!inline-flex !flex-col !items-start gap-0 min-w-0 w-full"
                      />
                      <span className="mt-1 block text-[11px] font-medium text-primary-600 group-hover:underline dark:text-primary-400">
                        {t('createGame.webCameraHintAction')}
                      </span>
                    </span>
                    <ExternalLink
                      size={15}
                      className="shrink-0 text-primary-500/70 transition-opacity group-hover:text-primary-600 group-hover:opacity-100 dark:text-primary-400/70 dark:group-hover:text-primary-300"
                      aria-hidden
                    />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
});
