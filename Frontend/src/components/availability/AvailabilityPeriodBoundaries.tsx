import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, RotateCcw } from 'lucide-react';
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
  const [openBucket, setOpenBucket] = useState<BucketId | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (openBucket === null) return;
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpenBucket(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [openBucket]);

  const describeBucket = (key: BucketId): string => {
    const mask = buildBucketMasks(value)[key];
    return maskToRanges(mask)
      .map((r) => formatRange(r, timeFormat))
      .join(', ');
  };

  return (
    <div
      ref={rootRef}
      className="min-w-0 rounded-xl border border-gray-200/80 bg-white/60 p-3 shadow-sm dark:border-gray-700/80 dark:bg-gray-900/40"
    >
      <div className="mb-3 flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {t('profile.availability.periodBoundaries.title')}
          </h3>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {t('profile.availability.periodBoundaries.subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpenBucket(null);
            onReset();
          }}
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
          const open = openBucket === key;
          return (
            <div
              key={key}
              className="overflow-hidden rounded-lg border border-gray-100 bg-gray-50/80 dark:border-gray-700/60 dark:bg-gray-800/50"
            >
              <button
                type="button"
                aria-expanded={open}
                aria-haspopup="listbox"
                onClick={() => setOpenBucket(open ? null : key)}
                className="flex w-full min-w-0 items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-gray-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:hover:bg-gray-700/40"
                aria-label={`${t(meta.labelKey)} — ${describeBucket(key)}`}
              >
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
                <Pencil
                  aria-hidden
                  strokeWidth={2}
                  className="size-3.5 shrink-0 text-gray-400 dark:text-gray-500"
                />
              </button>
              {open && (
                <div
                  className="flex flex-wrap gap-1 border-t border-gray-200/80 bg-white/50 px-2 py-2 dark:border-gray-700/80 dark:bg-gray-900/30"
                  role="listbox"
                  aria-label={t(meta.labelKey)}
                >
                  {hours.map((h) => {
                    const selected = value[key] === h;
                    return (
                      <button
                        key={h}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => {
                          onChange(setBoundaryHour(value, key, h));
                          setOpenBucket(null);
                        }}
                        className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                          selected
                            ? 'border-primary-500 bg-primary-50 text-primary-900 dark:bg-primary-950/50 dark:text-primary-100'
                            : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800'
                        }`}
                      >
                        {formatHour(h, timeFormat)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
