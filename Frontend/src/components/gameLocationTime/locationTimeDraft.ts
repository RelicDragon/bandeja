import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import type { LocationTimeMode } from './LocationTimeMode';

export type EditLocationTimeDraft = {
  locationTimeMode: LocationTimeMode;
  selectedBookingIds: string[];
  selectedBookingRecords: BooktimeBookingRecord[];
  timeOverride: boolean;
  overrideStartTime?: string;
  overrideEndTime?: string;
  willBookOnCreate: boolean;
  integratedCourtIds: string[];
};

export function areStringArraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

export function areBookingRecordsEqual(
  left: BooktimeBookingRecord[],
  right: BooktimeBookingRecord[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((record, index) => record.uuid === right[index]?.uuid);
}

export function buildSelectedBookingRecordsSyncKey(
  selectedBookingIds: string[],
  records: BooktimeBookingRecord[],
): string {
  return `${selectedBookingIds.join('\0')}:${records.map((record) => record.uuid).join('\0')}`;
}

export function areEditLocationTimeDraftsEqual(
  left: EditLocationTimeDraft | null | undefined,
  right: EditLocationTimeDraft,
): boolean {
  if (!left) return false;
  return (
    left.locationTimeMode === right.locationTimeMode &&
    left.timeOverride === right.timeOverride &&
    left.overrideStartTime === right.overrideStartTime &&
    left.overrideEndTime === right.overrideEndTime &&
    left.willBookOnCreate === right.willBookOnCreate &&
    areStringArraysEqual(left.selectedBookingIds, right.selectedBookingIds) &&
    areStringArraysEqual(left.integratedCourtIds, right.integratedCourtIds) &&
    areBookingRecordsEqual(left.selectedBookingRecords, right.selectedBookingRecords)
  );
}
