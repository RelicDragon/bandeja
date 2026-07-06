import { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { format, getYear, isToday, isTomorrow } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { getAppDateFnsLocale } from '@/utils/dateFormat';

interface SelectedDateHeadingProps {
  date: Date | null;
  hint?: string;
}

export const SelectedDateHeading = ({ date, hint }: SelectedDateHeadingProps) => {
  const { t, i18n } = useTranslation();
  const locale = useMemo(() => getAppDateFnsLocale(i18n.language), [i18n.language]);

  const label = useMemo(() => {
    if (!date) return null;
    const pattern = getYear(date) === getYear(new Date()) ? 'EEEE, d MMMM' : 'EEEE, d MMMM yyyy';
    const text = format(date, pattern, { locale });
    return text.charAt(0).toUpperCase() + text.slice(1);
  }, [date, locale]);

  const badge = useMemo(() => {
    if (!date) return null;
    if (isToday(date)) return t('createGame.today', { defaultValue: 'Today' });
    if (isTomorrow(date)) return t('createGame.tomorrow', { defaultValue: 'Tomorrow' });
    return null;
  }, [date, t]);

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {date && label && (
        <motion.div
          key={format(date, 'yyyy-MM-dd')}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="mb-3 max-w-md mx-auto px-1"
        >
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-gradient-to-r from-transparent to-gray-300 dark:to-gray-600" aria-hidden />
            <span className="flex items-center gap-2 whitespace-nowrap">
              <span className="text-sm font-semibold tracking-wide text-gray-800 dark:text-gray-100">
                {label}
              </span>
              {badge && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300">
                  {badge}
                </span>
              )}
            </span>
            <span className="h-px flex-1 bg-gradient-to-l from-transparent to-gray-300 dark:to-gray-600" aria-hidden />
          </div>
          {hint && (
            <p className="mt-1.5 text-center text-xs text-gray-500 dark:text-gray-400">{hint}</p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
