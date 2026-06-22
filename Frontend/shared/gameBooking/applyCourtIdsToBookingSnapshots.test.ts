import { describe, expect, it } from 'vitest';
import {
  applyCourtIdsToBookingSnapshots,
  mergeBookingSnapshotCourtIds,
} from './applyCourtIdsToBookingSnapshots';

describe('applyCourtIdsToBookingSnapshots', () => {
  it('fills missing snapshot court ids from selected courts', () => {
    expect(
      applyCourtIdsToBookingSnapshots(
        [{ externalBookingId: 'booking-1' }],
        ['court-a'],
      ),
    ).toEqual([{ externalBookingId: 'booking-1', courtId: 'court-a' }]);
  });

  it('keeps existing snapshot court ids', () => {
    expect(
      applyCourtIdsToBookingSnapshots(
        [{ externalBookingId: 'booking-1', courtId: 'court-b' }],
        ['court-a'],
      ),
    ).toEqual([{ externalBookingId: 'booking-1', courtId: 'court-b' }]);
  });
});

describe('mergeBookingSnapshotCourtIds', () => {
  it('returns snapshots unchanged when no court ids are provided', () => {
    const snapshots = [{ externalBookingId: 'booking-1' }];
    expect(mergeBookingSnapshotCourtIds(snapshots, [])).toBe(snapshots);
  });
});
