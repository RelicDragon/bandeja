import { describe, expect, it } from 'vitest';
import {
  resolveOccupancyCellClasses,
  resolveSelectionCellClasses,
  SELECTION_TINT_OVERLAY_CLASS,
  shouldShowGameTimeSelectionCheck,
} from './timeSlotCellStyles';

describe('timeSlotCellStyles', () => {
  it('keeps yellow occupancy when slot is in selected range', () => {
    const occupancy = resolveOccupancyCellClasses({
      isBooked: true,
      allUnconfirmed: false,
      isExternallyBooked: false,
      reservationCell: null,
    });
    expect(occupancy).toContain('bg-yellow-200');
    expect(resolveSelectionCellClasses(true)).toContain('ring-primary-500/70');
    expect(SELECTION_TINT_OVERLAY_CLASS).toContain('bg-primary-500/10');
    expect(occupancy).not.toContain('bg-primary-500');
  });

  it('keeps red occupancy when externally blocked and selected', () => {
    const occupancy = resolveOccupancyCellClasses({
      isBooked: true,
      allUnconfirmed: false,
      isExternallyBooked: true,
      reservationCell: null,
    });
    expect(occupancy).toContain('bg-red-200');
    expect(occupancy).not.toContain('bg-primary');
  });

  it('shows game-time checkmark for selected range but not linked reservation', () => {
    expect(
      shouldShowGameTimeSelectionCheck({
        isInSelectedRange: true,
        reservationCell: { hasSelectedReservation: true } as never,
      }),
    ).toBe(false);
    expect(
      shouldShowGameTimeSelectionCheck({
        isInSelectedRange: true,
        reservationCell: null,
      }),
    ).toBe(true);
  });
});
