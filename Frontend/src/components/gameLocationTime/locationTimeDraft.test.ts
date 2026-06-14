import { describe, expect, it } from 'vitest';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import {
  areBookingRecordsEqual,
  areEditLocationTimeDraftsEqual,
  buildSelectedBookingRecordsSyncKey,
} from './locationTimeDraft';

const record = (uuid: string): BooktimeBookingRecord => ({
  uuid,
  bookingStart: '2026-06-19T07:00:00.000Z',
  bookingEnd: '2026-06-19T08:00:00.000Z',
});

describe('locationTimeDraft helpers', () => {
  it('treats booking record arrays with same uuids as equal', () => {
    expect(areBookingRecordsEqual([record('a')], [record('a')])).toBe(true);
    expect(areBookingRecordsEqual([record('a')], [record('b')])).toBe(false);
  });

  it('builds stable sync keys for selected booking records', () => {
    const ids = ['ee54b247-d30c-43d8-a746-8a40e46f21dc'];
    const records = [record('ee54b247-d30c-43d8-a746-8a40e46f21dc')];
    const key = buildSelectedBookingRecordsSyncKey(ids, records);
    expect(buildSelectedBookingRecordsSyncKey([...ids], [...records])).toBe(key);
  });

  it('detects unchanged edit drafts', () => {
    const draft = {
      locationTimeMode: 'bookings' as const,
      selectedBookingIds: ['ee54b247-d30c-43d8-a746-8a40e46f21dc'],
      selectedBookingRecords: [record('ee54b247-d30c-43d8-a746-8a40e46f21dc')],
      timeOverride: false,
      willBookOnCreate: false,
      integratedCourtIds: [] as string[],
    };
    expect(areEditLocationTimeDraftsEqual(draft, { ...draft, selectedBookingRecords: [...draft.selectedBookingRecords] })).toBe(
      true,
    );
    expect(
      areEditLocationTimeDraftsEqual(draft, {
        ...draft,
        selectedBookingRecords: [record('other-id')],
      }),
    ).toBe(false);
  });
});
