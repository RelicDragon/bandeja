import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { SegmentedSwitch, type SegmentedSwitchTab } from '@/components/SegmentedSwitch';
import type { User, WeeklyAvailability, AvailabilityBucketBoundaries } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { useAvailabilityEditor } from '@/hooks/useAvailabilityEditor';
import {
  parseAvailabilityBucketBoundaries,
  isDefaultAvailabilityBucketBoundaries,
  DEFAULT_AVAILABILITY_BUCKET_BOUNDARIES,
} from '@/utils/availability';
import { AvailabilityHeader } from './AvailabilityHeader';
import { AvailabilityPresets } from './AvailabilityPresets';
import { AvailabilityGrid } from './AvailabilityGrid';
import { AvailabilityMobileGrid } from './AvailabilityMobileGrid';
import { AvailabilitySummary } from './AvailabilitySummary';
import { AvailabilityLegend } from './AvailabilityLegend';
import { AvailabilityPeriodBoundaries } from './AvailabilityPeriodBoundaries';

export interface WeeklyAvailabilityPanelProps {
  value: WeeklyAvailability | null | undefined;
  onChange: (value: WeeklyAvailability | null) => Promise<void> | void;
  savedBucketBoundaries: unknown;
  onPersistBucketBoundaries: (value: AvailabilityBucketBoundaries | null) => void;
  /** When omitted, uses the signed-in user's time format. */
  timeFormat?: User['timeFormat'] | null;
  /** Framer `layoutId` for the period/hour segmented control (avoid collisions across mounted panels). */
  hourPeriodLayoutId?: string;
  /**
   * When true (Profile): show/hide schedule control; body starts collapsed.
   * When false (e.g. league planner): no toggle; schedule editor is always visible.
   */
  showScheduleVisibilitySelector?: boolean;
}

export function WeeklyAvailabilityPanel({
  value,
  onChange,
  savedBucketBoundaries,
  onPersistBucketBoundaries,
  timeFormat: timeFormatProp,
  hourPeriodLayoutId = 'profileAvailabilityHourPeriod',
  showScheduleVisibilitySelector = true,
}: WeeklyAvailabilityPanelProps) {
  const { t } = useTranslation();
  const authUser = useAuthStore((s) => s.user);
  const timeFormat = timeFormatProp ?? authUser?.timeFormat;
  const [expanded, setExpanded] = useState(false);
  const [showHourly, setShowHourly] = useState(false);

  const parsedBoundaries = useMemo(
    () => parseAvailabilityBucketBoundaries(savedBucketBoundaries),
    [savedBucketBoundaries]
  );
  const [bucketBoundaries, setBucketBoundaries] = useState(parsedBoundaries);
  useEffect(() => {
    setBucketBoundaries(parsedBoundaries);
  }, [parsedBoundaries]);

  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    },
    []
  );

  const schedulePersistBucketBoundaries = useCallback(
    (b: AvailabilityBucketBoundaries) => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => {
        onPersistBucketBoundaries(isDefaultAvailabilityBucketBoundaries(b) ? null : b);
      }, 500);
    },
    [onPersistBucketBoundaries]
  );

  const editor = useAvailabilityEditor({
    initial: value,
    onCommit: onChange,
    bucketBoundaries,
  });

  const hourPeriodTabs = useMemo<SegmentedSwitchTab[]>(
    () => [
      { id: 'period', label: t('profile.availability.segmentPeriod') },
      { id: 'hour', label: t('profile.availability.segmentHour') },
    ],
    [t]
  );

  const scheduleBody = (
    <div className="min-w-0 space-y-4 pt-1">
      <SegmentedSwitch
        tabs={hourPeriodTabs}
        activeId={showHourly ? 'hour' : 'period'}
        onChange={(id) => setShowHourly(id === 'hour')}
        showOnlyActiveTabText={false}
        layoutId={hourPeriodLayoutId}
        className="!mx-0 self-start"
      />

      <AvailabilityPresets onApply={(p) => editor.applyPresetById(p)} />

      <div className="min-w-0 md:hidden">
        {showHourly ? (
          <AvailabilityGrid editor={editor} />
        ) : (
          <AvailabilityMobileGrid editor={editor} boundaries={bucketBoundaries} />
        )}
      </div>

      <div className="hidden md:block">
        {showHourly ? (
          <AvailabilityGrid editor={editor} />
        ) : (
          <AvailabilityMobileGrid editor={editor} boundaries={bucketBoundaries} />
        )}
      </div>

      {!showHourly && (
        <AvailabilityPeriodBoundaries
          value={bucketBoundaries}
          timeFormat={timeFormat}
          onChange={(b) => {
            setBucketBoundaries(b);
            schedulePersistBucketBoundaries(b);
          }}
          onReset={() => {
            setBucketBoundaries(DEFAULT_AVAILABILITY_BUCKET_BOUNDARIES);
            schedulePersistBucketBoundaries(DEFAULT_AVAILABILITY_BUCKET_BOUNDARIES);
          }}
        />
      )}

      <div className="pt-1">
        <AvailabilityLegend />
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <AvailabilityHeader
        isDefault={editor.isDefault}
        isEmptyWeek={editor.isEmptyWeek}
        status={editor.status}
      />

      {!editor.isDefault && !editor.isEmptyWeek && <AvailabilitySummary value={editor.value} />}

      {showScheduleVisibilitySelector ? (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50/70 px-3 py-2 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800/40 dark:hover:bg-gray-800"
          >
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
              {expanded ? t('profile.availability.hideSchedule') : t('profile.availability.editSchedule')}
            </span>
            <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown size={16} className="text-gray-500 dark:text-gray-400" />
            </motion.span>
          </button>

          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                key="availability-body"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="min-w-0 overflow-hidden"
              >
                {scheduleBody}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      ) : (
        scheduleBody
      )}
    </div>
  );
}
