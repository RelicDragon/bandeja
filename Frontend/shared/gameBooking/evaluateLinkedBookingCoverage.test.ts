import { describe, expect, it } from 'vitest';
import {
  evaluateLinkedBookingCoverage,
  findLinkedBookingsNeedingAttention,
} from './evaluateLinkedBookingCoverage';

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

  it('treats fewer courts as fully covered when the game is using that many courts', () => {
    const result = evaluateLinkedBookingCoverage(
      [
        { bookingStart: gameWindow.startTime, bookingEnd: gameWindow.endTime },
        { bookingStart: gameWindow.startTime, bookingEnd: gameWindow.endTime },
        { bookingStart: gameWindow.startTime, bookingEnd: gameWindow.endTime },
      ],
      { ...gameWindow, maxParticipants: 16, playersPerMatch: 4, courtCount: 3 },
    );
    expect(result.requiredBookingCount).toBe(3);
    expect(result.fullyCovered).toBe(true);
  });
});

describe('findLinkedBookingsNeedingAttention', () => {
  it('flags nothing while the bookings still span the game', () => {
    expect(
      findLinkedBookingsNeedingAttention(
        [{ bookingStart: gameWindow.startTime, bookingEnd: gameWindow.endTime }],
        gameWindow,
      ),
    ).toEqual([]);
  });

  it('flags nothing when back-to-back slots cover the game between them', () => {
    expect(
      findLinkedBookingsNeedingAttention(
        [
          { bookingStart: '2026-06-12T10:00:00.000Z', bookingEnd: '2026-06-12T11:00:00.000Z' },
          { bookingStart: '2026-06-12T11:00:00.000Z', bookingEnd: '2026-06-12T12:00:00.000Z' },
        ],
        gameWindow,
      ),
    ).toEqual([]);
  });

  it('flags the booking left behind when the game moves later', () => {
    expect(
      findLinkedBookingsNeedingAttention(
        [{ bookingStart: gameWindow.startTime, bookingEnd: gameWindow.endTime }],
        { startTime: '2026-06-12T11:00:00.000Z', endTime: '2026-06-12T13:00:00.000Z' },
      ),
    ).toEqual([0]);
  });

  it('flags only the bookings that do not span the new window', () => {
    expect(
      findLinkedBookingsNeedingAttention(
        [
          { bookingStart: '2026-06-12T09:00:00.000Z', bookingEnd: '2026-06-12T13:00:00.000Z' },
          { bookingStart: '2026-06-12T10:00:00.000Z', bookingEnd: '2026-06-12T11:00:00.000Z' },
        ],
        { startTime: '2026-06-12T11:00:00.000Z', endTime: '2026-06-12T14:00:00.000Z' },
      ),
    ).toEqual([0, 1]);
  });

  it('flags a booking with no times at all', () => {
    expect(findLinkedBookingsNeedingAttention([{}], gameWindow)).toEqual([0]);
  });
});
