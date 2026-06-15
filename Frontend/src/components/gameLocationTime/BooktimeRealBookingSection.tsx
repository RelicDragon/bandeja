import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import type { Club, Court } from '@/types';
import { resolveCourtNameParts } from '@/utils/courtDisplayName';

type BooktimeRealBookingSectionProps = {
  mode?: 'create' | 'edit';
  club: Club;
  courts: Court[];
  skipRealCourtBooking: boolean;
  onSkipRealCourtBookingChange: (value: boolean) => void;
};

export function BooktimeRealBookingSection({
  mode = 'create',
  club,
  courts,
  skipRealCourtBooking,
  onSkipRealCourtBookingChange,
}: BooktimeRealBookingSectionProps) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const visible = courts.length > 0;
  const collapseTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.24, ease: [0.21, 0.47, 0.32, 0.98] as const };
  const courtNames = courts
    .map((c) => resolveCourtNameParts(c.name, c.integrationCourtName).name)
    .join(', ');

  return (
    <motion.div
      initial={false}
      animate={{
        gridTemplateRows: visible ? '1fr' : '0fr',
        opacity: visible ? 1 : 0,
      }}
      transition={collapseTransition}
      className="grid min-h-0"
      aria-hidden={!visible}
    >
      <div className="overflow-hidden min-h-0">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40 p-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-gray-900 dark:text-white min-w-0">
              {t('createGame.locationTime.skipRealCourtToggle')}
            </span>
            <div data-testid="skip-real-court-booking-toggle">
              <ToggleSwitch checked={skipRealCourtBooking} onChange={onSkipRealCourtBookingChange} />
            </div>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {skipRealCourtBooking
              ? t(
                  mode === 'edit'
                    ? 'createGame.locationTime.skipRealCourtHintEdit'
                    : 'createGame.locationTime.skipRealCourtHint',
                )
              : t(
                  mode === 'edit'
                    ? 'createGame.locationTime.realCourtBookingHintEdit'
                    : 'createGame.locationTime.realCourtBookingHint',
                  { courts: courtNames, club: club.name },
                )}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
