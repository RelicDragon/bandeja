import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Briefcase, CalendarDays, Check, Sun, X } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import type { WeekdayKey } from '@/types';
import {
  WORKDAYS,
  WEEKDAYS,
  WEEKDAYS_SUNDAY_FIRST,
  WEEKEND_DAYS,
  getDayOfMonthInWeek,
  getShortDayLabel,
} from '@/utils/availability';

interface AvailabilityCopyMenuProps {
  open: boolean;
  sourceDay: WeekdayKey;
  weekdayLabel: string;
  dayOfMonth: number;
  weekStartYmd: string;
  weekStart: 'monday' | 'sunday';
  allOn: boolean;
  onToggleDay: () => void;
  onClose: () => void;
  onSelect: (days: WeekdayKey[]) => void;
}

const itemBase =
  'flex w-full items-center gap-2.5 rounded-md px-3.5 py-2 text-left text-[13px] leading-snug transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50';

function MenuSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3.5 pb-0.5 pt-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">{children}</p>
  );
}

export const AvailabilityCopyMenu = ({
  open,
  sourceDay,
  weekdayLabel,
  dayOfMonth,
  weekStartYmd,
  weekStart,
  allOn,
  onToggleDay,
  onClose,
  onSelect,
}: AvailabilityCopyMenuProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const panelRef = useRef<HTMLDivElement>(null);

  const otherDaysInOrder = useMemo(() => {
    const order = user?.weekStart === 'sunday' ? WEEKDAYS_SUNDAY_FIRST : WEEKDAYS;
    return order.filter((d) => d !== sourceDay);
  }, [user?.weekStart, sourceDay]);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEsc);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEsc);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const copyToLabel = t('profile.availability.copyToHeading');
  const dialogLabel = `${weekdayLabel}, ${dayOfMonth}`;

  const overlay = (
    <AnimatePresence>
      {open && (
        <motion.div
          key="availability-day-dialog"
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <button
            type="button"
            aria-label={t('common.close')}
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={dialogLabel}
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="relative w-full max-w-[280px] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center border-b border-gray-100 px-3.5 py-3 text-center dark:border-gray-800">
              <CalendarDays
                size={18}
                strokeWidth={1.75}
                className="mb-1.5 text-primary-600 dark:text-primary-400"
                aria-hidden
              />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {weekdayLabel}
              </span>
              <span className="mt-0.5 text-lg font-bold tabular-nums leading-none text-gray-900 dark:text-gray-100">
                {dayOfMonth}
              </span>
            </div>

            <div className="px-1.5 pt-1.5" role="group" aria-label={t('profile.availability.dayMenu.availabilityGroup')}>
              <button
                type="button"
                className={[
                  itemBase,
                  allOn
                    ? 'font-medium text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/35'
                    : 'font-medium text-primary-800 hover:bg-primary-50 dark:text-primary-200 dark:hover:bg-primary-950/40',
                ].join(' ')}
                onClick={onToggleDay}
              >
                {allOn ? (
                  <X size={16} strokeWidth={2} className="shrink-0 opacity-80" aria-hidden />
                ) : (
                  <Check size={16} strokeWidth={2} className="shrink-0" aria-hidden />
                )}
                {allOn
                  ? t('profile.availability.dayMenu.turnOff')
                  : t('profile.availability.dayMenu.turnOn')}
              </button>
            </div>

            <div className="my-1.5 border-t border-gray-100 dark:border-gray-800" role="separator" />

            <MenuSectionLabel>{copyToLabel}</MenuSectionLabel>
            <div className="space-y-0.5 px-1.5 pb-1" role="group">
              <button
                type="button"
                className={[itemBase, 'text-gray-800 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800/80'].join(' ')}
                onClick={() => onSelect(WORKDAYS.filter((d) => d !== sourceDay))}
              >
                <Briefcase size={16} strokeWidth={1.75} className="shrink-0 text-blue-600 dark:text-blue-400" aria-hidden />
                {t('profile.availability.presets.weekdays')}
              </button>
              <button
                type="button"
                className={[itemBase, 'text-gray-800 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800/80'].join(' ')}
                onClick={() => onSelect(WEEKEND_DAYS.filter((d) => d !== sourceDay))}
              >
                <Sun size={16} strokeWidth={1.75} className="shrink-0 text-orange-500 dark:text-orange-400" aria-hidden />
                {t('profile.availability.presets.weekends')}
              </button>
              <button
                type="button"
                className={[itemBase, 'text-gray-800 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800/80'].join(' ')}
                onClick={() => onSelect(otherDaysInOrder)}
              >
                <CalendarDays size={16} strokeWidth={1.75} className="shrink-0 text-gray-500 dark:text-gray-400" aria-hidden />
                {t('profile.availability.copyToThisWeek')}
              </button>
            </div>

            <div className="my-1.5 border-t border-gray-100 dark:border-gray-800" role="separator" />

            <MenuSectionLabel>{t('profile.availability.dayMenu.pickDay')}</MenuSectionLabel>
            <div className="grid grid-cols-3 gap-1.5 px-2.5 pb-2.5" role="group">
              {otherDaysInOrder.map((d) => (
                <button
                  key={d}
                  type="button"
                  className="flex flex-col items-center rounded-lg border border-gray-200 bg-gray-50/80 px-1 py-1.5 transition-colors hover:border-primary-300 hover:bg-primary-50 active:scale-[0.97] dark:border-gray-600 dark:bg-gray-800/50 dark:hover:border-primary-500/40 dark:hover:bg-primary-950/30"
                  onClick={() => onSelect([d])}
                >
                  <span className="text-[10px] font-semibold uppercase leading-none tracking-tight text-gray-600 dark:text-gray-400">
                    {getShortDayLabel(t, d)}
                  </span>
                  <span className="mt-0.5 text-xs font-bold tabular-nums leading-none text-gray-900 dark:text-gray-100">
                    {getDayOfMonthInWeek(weekStartYmd, d, weekStart)}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return overlay;
  return createPortal(overlay, document.body);
};
