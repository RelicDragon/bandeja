import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays } from 'date-fns';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { useAuthStore } from '@/store/authStore';
const DURATION_DAYS = [1, 2, 3, 5, 7, 10] as const;

const BTN_BASE =
  'inline-flex items-center justify-center px-3 py-1.5 text-sm rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/20';

function formatEndHint(endDate: Date, locale: string, hour12: boolean): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12,
  }).format(endDate);
}

export function AuctionDurationSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (endTime: string) => void;
}) {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const displaySettings = useMemo(
    () => (user ? resolveDisplaySettings(user) : resolveDisplaySettings(null)),
    [user]
  );

  const handleSelect = (days: number) => {
    const endDate = addDays(new Date(), days);
    onChange(endDate.toISOString());
  };

  const selectedDays = useMemo(() => {
    if (!value) return null;
    const daysFromNow = (new Date(value).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    const closest = DURATION_DAYS.reduce((a, b) =>
      Math.abs(a - daysFromNow) < Math.abs(b - daysFromNow) ? a : b
    );
    return Math.abs(daysFromNow - closest) < 0.5 ? closest : null;
  }, [value]);

  const endHint = value
    ? formatEndHint(new Date(value), displaySettings.locale, displaySettings.hour12)
    : null;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {DURATION_DAYS.map((days) => {
          const isSelected = selectedDays === days;
          return (
            <button
              key={days}
              type="button"
              onClick={() => handleSelect(days)}
              className={
                BTN_BASE +
                (isSelected
                  ? ' bg-primary-500 text-white border-primary-500 dark:bg-primary-500 dark:text-white'
                  : ' border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-800 dark:text-white hover:border-primary-500/50')
              }
            >
              {t(`marketplace.auctionDuration${days}`, { defaultValue: `${days} day${days === 1 ? '' : 's'}` })}
            </button>
          );
        })}
      </div>
      {endHint && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t('marketplace.auctionEndsAt', { defaultValue: 'Ends at' })}: {endHint}
        </p>
      )}
    </div>
  );
}
