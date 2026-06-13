import { describe, expect, it } from 'vitest';
import { evaluateLinkedBookingCoverage } from './evaluateLinkedBookingCoverage';

const gameWindow = {
  startTime: '2026-06-12T10:00:00.000Z',
  endTime: '2026-06-12T12:00:00.000Z',
  maxParticipants: 4,
  playersPerMatch: 4,
};

describe('evaluateLinkedBookingCoverage', () => {
  it('is fully covered when one booking matches game time for a single court', () => {
    const result = evaluateLinkedBookingCoverage(
      [{ bookingStart: gameWindow.startTime, bookingEnd: gameWindow.endTime }],
      gameWindow,
    );
    expect(result).toEqual({
      courtCountMet: true,
      timeCoverageMet: true,
      fullyCovered: true,
      requiredBookingCount: 1,
    });
  });

  it('is not fully covered when booking count is below required courts', () => {
    const result = evaluateLinkedBookingCoverage(
      [{ bookingStart: gameWindow.startTime, bookingEnd: gameWindow.endTime }],
      { ...gameWindow, maxParticipants: 8, playersPerMatch: 4 },
    );
    expect(result.courtCountMet).toBe(false);
    expect(result.requiredBookingCount).toBe(2);
    expect(result.fullyCovered).toBe(false);
  });

  it('is not fully covered when derived booking window is shorter than game time', () => {
    const result = evaluateLinkedBookingCoverage(
      [{ bookingStart: gameWindow.startTime, bookingEnd: '2026-06-12T11:00:00.000Z' }],
      gameWindow,
    );
    expect(result.timeCoverageMet).toBe(false);
    expect(result.fullyCovered).toBe(false);
  });

  it('is fully covered when union of bookings spans the full game window', () => {
    const result = evaluateLinkedBookingCoverage(
      [
        { bookingStart: '2026-06-12T09:30:00.000Z', bookingEnd: '2026-06-12T12:30:00.000Z' },
        { bookingStart: '2026-06-12T09:45:00.000Z', bookingEnd: '2026-06-12T12:15:00.000Z' },
      ],
      { ...gameWindow, maxParticipants: 8, playersPerMatch: 4 },
    );
    expect(result.fullyCovered).toBe(true);
  });
});
