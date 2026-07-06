import { CloudSun } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface MonthCalendarWeatherToggleProps {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  compact?: boolean;
}

export function MonthCalendarWeatherToggle({
  active,
  disabled = false,
  onClick,
  compact = false,
}: MonthCalendarWeatherToggleProps) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={
        disabled
          ? t('weather.calendarToggleUnavailable', {
              defaultValue: 'Weather unavailable without a selected city',
            })
          : active
          ? t('weather.calendarToggleActive', { defaultValue: 'Hide weather on calendar' })
          : t('weather.calendarToggle', { defaultValue: 'Show weather on calendar' })
      }
      className={`inline-flex shrink-0 items-center justify-center rounded-lg transition-colors ${
        compact ? 'p-1.5' : 'p-2'
      } ${
        disabled
          ? 'cursor-not-allowed text-gray-300 dark:text-gray-600'
          : active
          ? 'bg-sky-100 text-sky-700 hover:bg-sky-200 dark:bg-sky-900/50 dark:text-sky-300 dark:hover:bg-sky-900/70'
          : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
      }`}
    >
      <CloudSun size={compact ? 16 : 18} strokeWidth={2} aria-hidden />
    </button>
  );
}
