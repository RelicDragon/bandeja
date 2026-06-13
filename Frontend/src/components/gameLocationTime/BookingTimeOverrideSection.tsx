import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { ToggleSwitch } from '@/components/ToggleSwitch';

type BookingTimeOverrideSectionProps = {
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  startTime: string;
  endTime: string;
  onStartTimeChange: (value: string) => void;
  onEndTimeChange: (value: string) => void;
  minStart: string;
  maxEnd: string;
};

function isoToTimeInput(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function applyTimeToIso(iso: string, time: string): string {
  const [h, m] = time.split(':').map(Number);
  const date = new Date(iso);
  date.setHours(h, m, 0, 0);
  return date.toISOString();
}

export function BookingTimeOverrideSection({
  enabled,
  onEnabledChange,
  startTime,
  endTime,
  onStartTimeChange,
  onEndTimeChange,
  minStart,
  maxEnd,
}: BookingTimeOverrideSectionProps) {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40 p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-gray-900 dark:text-white">
          {t('createGame.locationTime.overrideToggle')}
        </span>
        <div data-testid="booking-time-override-toggle">
          <ToggleSwitch checked={enabled} onChange={onEnabledChange} />
        </div>
      </div>
      <AnimatePresence initial={false}>
        {enabled ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="overflow-hidden space-y-2"
          >
            <p className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
              <ChevronDown size={14} className="rotate-180" />
              {t('createGame.locationTime.overrideHint')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-gray-600 dark:text-gray-400">
                Start
                <input
                  type="time"
                  value={isoToTimeInput(startTime)}
                  min={isoToTimeInput(minStart)}
                  max={isoToTimeInput(maxEnd)}
                  onChange={(e) => onStartTimeChange(applyTimeToIso(startTime, e.target.value))}
                  className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs text-gray-600 dark:text-gray-400">
                End
                <input
                  type="time"
                  value={isoToTimeInput(endTime)}
                  min={isoToTimeInput(minStart)}
                  max={isoToTimeInput(maxEnd)}
                  onChange={(e) => onEndTimeChange(applyTimeToIso(endTime, e.target.value))}
                  className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm"
                />
              </label>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
