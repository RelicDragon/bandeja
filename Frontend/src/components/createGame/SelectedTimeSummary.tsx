import { useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { EntityType } from '@/types';

function parseTime(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

function formatEndTime(startTime: string, durationHours: number): string {
  const [h, m] = startTime.split(':').map(Number);
  const totalMinutes = Math.round(durationHours * 60);
  const endMinutes = h * 60 + m + totalMinutes;
  const endH = Math.floor(endMinutes / 60);
  const endM = endMinutes % 60;
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
}

type SelectedTimeSummaryProps = {
  selectedTime: string;
  duration?: number;
  durationLabel?: string;
  entityType: EntityType;
};

export function SelectedTimeSummary({
  selectedTime,
  duration,
  durationLabel,
  entityType,
}: SelectedTimeSummaryProps) {
  const { t } = useTranslation();
  const prevKeyRef = useRef<string | null>(null);
  const slideDirectionRef = useRef(0);

  const summaryKey = selectedTime ? `${selectedTime}|${duration ?? ''}|${entityType}` : null;

  if (summaryKey !== prevKeyRef.current) {
    if (prevKeyRef.current && summaryKey) {
      const [prevTime] = prevKeyRef.current.split('|');
      const [nextTime] = summaryKey.split('|');
      slideDirectionRef.current =
        prevTime !== nextTime
          ? parseTime(nextTime) >= parseTime(prevTime) ? 1 : -1
          : 0;
    } else {
      slideDirectionRef.current = 0;
    }
    prevKeyRef.current = summaryKey;
  }

  const slideDirection = slideDirectionRef.current;
  const endTime = selectedTime && entityType !== 'BAR' && duration
    ? formatEndTime(selectedTime, duration)
    : null;

  return (
    <div className="relative mt-3 overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        {summaryKey ? (
          <motion.div
            key={summaryKey}
            initial={
              slideDirection !== 0
                ? { x: slideDirection * 32, opacity: 0 }
                : { y: -6, opacity: 0 }
            }
            animate={{ x: 0, y: 0, opacity: 1 }}
            exit={
              slideDirection !== 0
                ? { x: slideDirection * -32, opacity: 0 }
                : { y: 6, opacity: 0 }
            }
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="flex items-center gap-3 rounded-xl border border-primary-200/70 dark:border-primary-800/60 bg-gradient-to-r from-primary-50 to-white dark:from-primary-950/50 dark:to-gray-900/40 px-4 py-3 shadow-sm"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-500/15 dark:bg-primary-400/10">
              <Clock className="h-5 w-5 text-primary-600 dark:text-primary-400" strokeWidth={2} />
            </div>
            <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-primary-600/90 dark:text-primary-400/90">
                  {t('createGame.timeSlot')}
                </p>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="text-xl font-bold tabular-nums tracking-tight text-gray-900 dark:text-white">
                    {selectedTime}
                  </span>
                  {endTime ? (
                    <>
                      <ArrowRight
                        className="h-4 w-4 shrink-0 text-primary-400 dark:text-primary-500"
                        strokeWidth={2.5}
                        aria-hidden
                      />
                      <span className="text-xl font-bold tabular-nums tracking-tight text-gray-900 dark:text-white">
                        {endTime}
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
              {durationLabel ? (
                <span className="shrink-0 rounded-full bg-primary-500 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
                  {durationLabel}
                </span>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
