import { useTranslation } from 'react-i18next';
import { Copy } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import type { WeeklyAvailability } from '@/types';
import { summarizeWeek } from '@/utils/availability';

interface AvailabilitySummaryProps {
  value: WeeklyAvailability | null;
  onCopyToOtherWeeks?: () => void;
  copyDisabled?: boolean;
}

export const AvailabilitySummary = ({
  value,
  onCopyToOtherWeeks,
  copyDisabled = false,
}: AvailabilitySummaryProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const lines = summarizeWeek(t, value, {
    timeFormat: user?.timeFormat,
    weekStart: user?.weekStart,
  });
  return (
    <div className="space-y-2">
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
      {onCopyToOtherWeeks && (
        <button
          type="button"
          onClick={onCopyToOtherWeeks}
          disabled={copyDisabled}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <Copy size={12} />
          {t('profile.availability.copyToOtherWeeks')}
        </button>
      )}
    </div>
  );
};
