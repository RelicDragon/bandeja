import { useCallback, useEffect, useRef, useState } from 'react';
import type { WeeklyAvailability, WeekdayKey, AvailabilityBucketBoundaries } from '@/types';
import {
  ensureWeek,
  setHourInWeek,
  toggleDayColumn,
  toggleHourRow,
  copyDay,
  setDayFull,
  setDay,
  areEqual,
  isFullWeek,
  isEmptyWeek,
} from '@/utils/availability/bitmask';
import { applyPreset, toggleBucket, type PresetId, type BucketId } from '@/utils/availability/presets';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface UseAvailabilityEditorOptions {
  initial: WeeklyAvailability | null | undefined;
  onCommit: (value: WeeklyAvailability | null) => Promise<void> | void;
  bucketBoundaries: AvailabilityBucketBoundaries;
  debounceMs?: number;
}

export interface UseAvailabilityEditorReturn {
  value: WeeklyAvailability;
  isDefault: boolean;
  isEmptyWeek: boolean;
  status: SaveStatus;
  setHour: (day: WeekdayKey, hour: number, on: boolean) => void;
  toggleDay: (day: WeekdayKey) => void;
  toggleHour: (hour: number) => void;
  setDayMask: (day: WeekdayKey, mask: number) => void;
  setDayOn: (day: WeekdayKey, on: boolean) => void;
  toggleBucketOn: (day: WeekdayKey, bucket: BucketId) => void;
  applyPresetById: (preset: PresetId, mode?: 'replace' | 'add' | 'remove') => void;
  copyDayTo: (from: WeekdayKey, to: WeekdayKey[]) => void;
}

export const useAvailabilityEditor = ({
  initial,
  onCommit,
  bucketBoundaries,
  debounceMs = 500,
}: UseAvailabilityEditorOptions): UseAvailabilityEditorReturn => {
  const [value, setValue] = useState<WeeklyAvailability>(() => ensureWeek(initial));
  const [status, setStatus] = useState<SaveStatus>('idle');
  const lastCommittedRef = useRef<WeeklyAvailability | null>(initial ?? null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    lastCommittedRef.current = initial ?? null;
    setValue(ensureWeek(initial));
  }, [initial]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    };
  }, []);

  const scheduleCommit = useCallback(
    (next: WeeklyAvailability) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setStatus('saving');
      timerRef.current = setTimeout(async () => {
        try {
          const payload: WeeklyAvailability | null = isFullWeek(next) ? null : next;
          if (areEqual(payload as any, lastCommittedRef.current as any)) {
            setStatus('idle');
            return;
          }
          await onCommit(payload);
          lastCommittedRef.current = payload;
          setStatus('saved');
          if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
          statusTimerRef.current = setTimeout(() => setStatus('idle'), 1500);
        } catch {
          setStatus('error');
        }
      }, debounceMs);
    },
    [debounceMs, onCommit]
  );

  const mutate = useCallback(
    (updater: (prev: WeeklyAvailability) => WeeklyAvailability) => {
      setValue((prev) => {
        const next = updater(prev);
        scheduleCommit(next);
        return next;
      });
    },
    [scheduleCommit]
  );

  const setHour = useCallback(
    (day: WeekdayKey, hour: number, on: boolean) =>
      mutate((prev) => setHourInWeek(prev, day, hour, on)),
    [mutate]
  );

  const toggleDay = useCallback(
    (day: WeekdayKey) => mutate((prev) => toggleDayColumn(prev, day)),
    [mutate]
  );

  const toggleHour = useCallback(
    (hour: number) => mutate((prev) => toggleHourRow(prev, hour)),
    [mutate]
  );

  const setDayMask = useCallback(
    (day: WeekdayKey, mask: number) => mutate((prev) => setDay(prev, day, mask)),
    [mutate]
  );

  const setDayOn = useCallback(
    (day: WeekdayKey, on: boolean) => mutate((prev) => setDayFull(prev, day, on)),
    [mutate]
  );

  const toggleBucketOn = useCallback(
    (day: WeekdayKey, bucket: BucketId) =>
      mutate((prev) => toggleBucket(prev, day, bucket, bucketBoundaries)),
    [mutate, bucketBoundaries]
  );

  const applyPresetById = useCallback(
    (preset: PresetId, mode: 'replace' | 'add' | 'remove' = 'replace') =>
      mutate((prev) => applyPreset(prev, preset, bucketBoundaries, mode)),
    [mutate, bucketBoundaries]
  );

  const copyDayTo = useCallback(
    (from: WeekdayKey, to: WeekdayKey[]) => mutate((prev) => copyDay(prev, from, to)),
    [mutate]
  );

  return {
    value,
    isDefault: isFullWeek(value),
    isEmptyWeek: isEmptyWeek(value),
    status,
    setHour,
    toggleDay,
    toggleHour,
    setDayMask,
    setDayOn,
    toggleBucketOn,
    applyPresetById,
    copyDayTo,
  };
};
