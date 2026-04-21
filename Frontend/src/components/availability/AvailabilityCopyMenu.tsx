import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import type { WeekdayKey } from '@/types';
import { WORKDAYS, WEEKEND_DAYS, WEEKDAYS, getShortDayLabel } from '@/utils/availability';

interface AvailabilityCopyMenuProps {
  sourceDay: WeekdayKey;
  onClose: () => void;
  onSelect: (days: WeekdayKey[]) => void;
}

export const AvailabilityCopyMenu = ({ sourceDay, onClose, onSelect }: AvailabilityCopyMenuProps) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [onClose]);

  const otherDays = WEEKDAYS.filter((d) => d !== sourceDay);

  return (
    <AnimatePresence>
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: -4, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -4, scale: 0.96 }}
        transition={{ duration: 0.12 }}
        className="absolute top-full left-1/2 -translate-x-1/2 z-20 mt-1 min-w-[160px] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl py-1"
      >
        <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold">
          {t('profile.availability.copyTo')}
        </div>
        <button
          type="button"
          className="w-full text-left px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 hover:bg-primary-50 dark:hover:bg-gray-800"
          onClick={() => onSelect(WORKDAYS.filter((d) => d !== sourceDay))}
        >
          {t('profile.availability.presets.weekdays')}
        </button>
        <button
          type="button"
          className="w-full text-left px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 hover:bg-primary-50 dark:hover:bg-gray-800"
          onClick={() => onSelect(WEEKEND_DAYS.filter((d) => d !== sourceDay))}
        >
          {t('profile.availability.presets.weekends')}
        </button>
        <button
          type="button"
          className="w-full text-left px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 hover:bg-primary-50 dark:hover:bg-gray-800"
          onClick={() => onSelect(otherDays)}
        >
          {t('profile.availability.copyToAll')}
        </button>
        <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
        <div className="grid grid-cols-3 gap-1 px-2 pb-1">
          {otherDays.map((d) => (
            <button
              key={d}
              type="button"
              className="text-xs px-2 py-1 rounded hover:bg-primary-50 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200"
              onClick={() => onSelect([d])}
            >
              {getShortDayLabel(t, d)}
            </button>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
