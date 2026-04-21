import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/authStore';
import type { WeeklyAvailability } from '@/types';
import { summarizeWeek } from '@/utils/availability';

interface AvailabilitySummaryProps {
  value: WeeklyAvailability | null;
}

export const AvailabilitySummary = ({ value }: AvailabilitySummaryProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const lines = summarizeWeek(t, value, {
    timeFormat: user?.timeFormat,
    weekStart: user?.weekStart,
  });
  return (
    <div className="text-sm text-gray-600 dark:text-gray-400 leading-snug space-y-0.5">
      {lines.map((line, i) => (
        <div
          key={i}
          className={
            line.unavailable
              ? 'text-red-600 dark:text-red-400'
              : line.allDayAvailable
                ? 'text-emerald-600 dark:text-emerald-400'
                : undefined
          }
        >
          {line.text}
        </div>
      ))}
    </div>
  );
};
