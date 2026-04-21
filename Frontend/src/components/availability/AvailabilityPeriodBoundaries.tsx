import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import type { AvailabilityBucketBoundaries } from '@/types';
import {
  BUCKET_ORDER,
  buildBucketMasks,
  validHoursForBoundary,
  setBoundaryHour,
  type BucketId,
} from '@/utils/availability';
import { maskToRanges, formatRange, formatHour } from '@/utils/availability/format';
import { BUCKET_META } from './bucketMeta';

interface AvailabilityPeriodBoundariesProps {
  value: AvailabilityBucketBoundaries;
  timeFormat?: 'auto' | '12h' | '24h';
  onChange: (next: AvailabilityBucketBoundaries) => void;
  onReset: () => void;
}

export const AvailabilityPeriodBoundaries = ({
  value,
  timeFormat,
  onChange,
  onReset,
}: AvailabilityPeriodBoundariesProps) => {
  const { t } = useTranslation();

  const describeBucket = (key: BucketId): string => {
    const mask = buildBucketMasks(value)[key];
    return maskToRanges(mask)
      .map((r) => formatRange(r, timeFormat))
      .join(', ');
  };

  return (
    <div className="rounded-xl border border-gray-200/80 bg-white/60 p-3 shadow-sm dark:border-gray-700/80 dark:bg-gray-900/40">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {t('profile.availability.periodBoundaries.title')}
          </h3>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {t('profile.availability.periodBoundaries.subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <RotateCcw size={12} />
          {t('profile.availability.periodBoundaries.reset')}
        </button>
      </div>

      <div className="space-y-2">
        {BUCKET_ORDER.map((key) => {
          const meta = BUCKET_META[key];
          const hours = validHoursForBoundary(value, key);
          return (
            <div
              key={key}
              className="flex flex-col gap-1.5 rounded-lg border border-gray-100 bg-gray-50/80 px-2.5 py-2 dark:border-gray-700/60 dark:bg-gray-800/50 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <meta.Icon
                  strokeWidth={2}
                  className="size-4 shrink-0 text-gray-500 dark:text-gray-400"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                    {t(meta.labelKey)}
                  </div>
                  <div className="truncate text-[11px] text-gray-500 dark:text-gray-400">
                    {describeBucket(key)}
                  </div>
                </div>
              </div>
              <label className="flex shrink-0 items-center gap-1.5 sm:justify-end">
                <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  {t('profile.availability.periodBoundaries.startsAt')}
                </span>
                <select
                  value={value[key]}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    onChange(setBoundaryHour(value, key, v));
                  }}
                  className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                >
                  {hours.map((h) => (
                    <option key={h} value={h}>
                      {formatHour(h, timeFormat)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
};
