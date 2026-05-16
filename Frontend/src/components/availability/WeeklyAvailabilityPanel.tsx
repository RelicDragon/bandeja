import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { SegmentedSwitch, type SegmentedSwitchTab } from '@/components/SegmentedSwitch';
import type { User, WeeklyAvailability, AvailabilityBucketBoundaries, WeeklyAvailabilityDoc, RollingWeeklyAvailabilityV2 } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { useAvailabilityEditor } from '@/hooks/useAvailabilityEditor';
import {
  parseAvailabilityBucketBoundaries,
  isDefaultAvailabilityBucketBoundaries,
  DEFAULT_AVAILABILITY_BUCKET_BOUNDARIES,
} from '@/utils/availability';
import {
  ensureNormalizedRollingDoc,
  effectiveSlotMask,
  setRollingSlot,
  copyWeekMaskToOtherRollingSlots,
  weekRangeLabel,
  addDaysToYmd,
  isRollingDocDefault,
} from '@/utils/availability/rolling';
import { AvailabilityHeader } from './AvailabilityHeader';
import { AvailabilityPresets } from './AvailabilityPresets';
import { AvailabilityGrid } from './AvailabilityGrid';
import { AvailabilityMobileGrid } from './AvailabilityMobileGrid';
import { AvailabilitySummary } from './AvailabilitySummary';
import { AvailabilityLegend } from './AvailabilityLegend';
import { AvailabilityPeriodBoundaries } from './AvailabilityPeriodBoundaries';

export interface WeeklyAvailabilityPanelProps {
  value: WeeklyAvailabilityDoc | null | undefined;
  onChange: (value: RollingWeeklyAvailabilityV2) => Promise<void> | void;
  savedBucketBoundaries: unknown;
  onPersistBucketBoundaries: (value: AvailabilityBucketBoundaries | null) => void;
  timeFormat?: User['timeFormat'] | null;
  hourPeriodLayoutId?: string;
  showScheduleVisibilitySelector?: boolean;
}

type SlotIndex = 0 | 1 | 2;

const SLOT_INDICES: SlotIndex[] = [0, 1, 2];

function resolveWeekStartPref(pref: string | null | undefined): 'monday' | 'sunday' {
  return pref === 'sunday' ? 'sunday' : 'monday';
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
  const { t, i18n } = useTranslation();
  const authUser = useAuthStore((s) => s.user);
  const timeFormat = timeFormatProp ?? authUser?.timeFormat;
  const startsOn = resolveWeekStartPref(authUser?.weekStart);

  const [expanded, setExpanded] = useState(false);
  const [showHourly, setShowHourly] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<SlotIndex>(0);

  const [rollingDoc, setRollingDoc] = useState<RollingWeeklyAvailabilityV2>(() =>
    ensureNormalizedRollingDoc(value, startsOn)
  );

  useEffect(() => {
    setRollingDoc(ensureNormalizedRollingDoc(value, startsOn));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

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

  const currentSlotInitial: WeeklyAvailability = useMemo(
    () => effectiveSlotMask(rollingDoc, selectedSlot),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rollingDoc.anchor, selectedSlot]
  );

  const editor = useAvailabilityEditor({
    initial: currentSlotInitial,
    onCommit: useCallback(
      async (mask: WeeklyAvailability | null) => {
        const next = setRollingSlot(rollingDoc, selectedSlot, mask);
        setRollingDoc(next);
        await onChange(next);
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [rollingDoc.anchor, rollingDoc.baseline, selectedSlot, onChange]
    ),
    bucketBoundaries,
  });

  const weekSlotLabels = useMemo(() => {
    const locale = i18n.language || 'en';
    return SLOT_INDICES.map((i) => ({
      heading: [
        t('profile.availability.weekTabs.current'),
        t('profile.availability.weekTabs.next'),
        t('profile.availability.weekTabs.afterThat'),
      ][i],
      dates: weekRangeLabel(addDaysToYmd(rollingDoc.anchor, i * 7), locale),
    }));
  }, [rollingDoc.anchor, i18n.language, t]);

  const handleCopyToOtherWeeks = useCallback(async () => {
    const next = copyWeekMaskToOtherRollingSlots(rollingDoc, selectedSlot, editor.value);
    setRollingDoc(next);
    await onChange(next);
  }, [rollingDoc, selectedSlot, editor.value, onChange]);

  const hourPeriodTabs = useMemo<SegmentedSwitchTab[]>(
    () => [
      { id: 'period', label: t('profile.availability.segmentPeriod') },
      { id: 'hour', label: t('profile.availability.segmentHour') },
    ],
    [t]
  );

  const weekSelector = (
    <div className="flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-700">
      {SLOT_INDICES.map((i) => {
        const active = selectedSlot === i;
        return (
          <button
            key={i}
            type="button"
            onClick={() => setSelectedSlot(i)}
            className={`relative flex flex-1 flex-col items-center rounded-md px-2 py-1.5 text-center transition-colors duration-200 ${
              active
                ? 'text-gray-900 dark:text-white'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            {active && (
              <motion.div
                className="absolute inset-0 rounded-md bg-primary-500/15 dark:bg-primary-400/15 ring-1 ring-primary-500/30 dark:ring-primary-400/30"
                layoutId={`${hourPeriodLayoutId}-weekSlot`}
                initial={false}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              />
            )}
            <span className="relative text-xs font-semibold leading-tight">
              {weekSlotLabels[i].heading}
            </span>
            <span className="relative mt-0.5 text-[10px] leading-tight opacity-70">
              {weekSlotLabels[i].dates}
            </span>
          </button>
        );
      })}
    </div>
  );

  // P2: "24/7" badge only when the entire rolling doc is unrestricted
  const isDocDefault = isRollingDocDefault(rollingDoc);

  const scheduleBody = (
    <div className="min-w-0 space-y-4 pt-1">
      {weekSelector}

      {/* P3: summary scoped to the selected slot */}
      {!editor.isDefault && !editor.isEmptyWeek && (
        <AvailabilitySummary
          value={editor.value}
          onCopyToOtherWeeks={handleCopyToOtherWeeks}
          copyDisabled={editor.status === 'saving'}
        />
      )}

      <SegmentedSwitch
        tabs={hourPeriodTabs}
        activeId={showHourly ? 'hour' : 'period'}
        onChange={(id) => setShowHourly(id === 'hour')}
        showOnlyActiveTabText={false}
        layoutId={hourPeriodLayoutId}
        className="mx-auto"
      />

      <AvailabilityPresets
        value={editor.value}
        boundaries={bucketBoundaries}
        isFullWeek={editor.isDefault}
        onApply={(p) => editor.applyPresetById(p)}
      />

      <div className="min-w-0 md:hidden">
        {showHourly ? (
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <AvailabilityGrid editor={editor} />
            </div>
          </div>
        ) : (
          <AvailabilityMobileGrid editor={editor} boundaries={bucketBoundaries} />
        )}
      </div>

      <div className="hidden min-w-0 md:block">
        {showHourly ? (
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <AvailabilityGrid editor={editor} />
            </div>
          </div>
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
        isDefault={isDocDefault}
        isEmptyWeek={editor.isEmptyWeek}
        status={editor.status}
      />

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
