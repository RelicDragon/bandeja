import { describe, expect, it } from 'vitest';
import {
  gameSlotIntervalsOverlap,
  occupancyBlocksSlot,
  userIdsBusyInSlot,
  type SlotOccupancy,
  type SlotTarget,
} from './gameSlotOverlap';

const t0 = Date.parse('2026-08-20T18:00:00.000Z');
const t1 = Date.parse('2026-08-20T19:00:00.000Z');
const t2 = Date.parse('2026-08-20T20:00:00.000Z');
const t3 = Date.parse('2026-08-20T21:00:00.000Z');

const target: SlotTarget = {
  gameId: 'target',
  startTime: t1,
  endTime: t2,
  timeIsSet: true,
};

function occupancy(over: Partial<SlotOccupancy> & Pick<SlotOccupancy, 'gameId'>): SlotOccupancy {
  return {
    status: 'PLAYING',
    startTime: t1,
    endTime: t2,
    timeIsSet: true,
    gameStatus: 'ANNOUNCED',
    entityType: 'GAME',
    ...over,
  };
}

describe('gameSlotIntervalsOverlap', () => {
  it('detects interior overlap', () => {
    expect(gameSlotIntervalsOverlap(t0, t2, t1, t3)).toBe(true);
    expect(gameSlotIntervalsOverlap(t1, t2, t1, t2)).toBe(true);
  });

  it('treats touch-at-boundary as free', () => {
    expect(gameSlotIntervalsOverlap(t0, t1, t1, t2)).toBe(false);
    expect(gameSlotIntervalsOverlap(t1, t2, t0, t1)).toBe(false);
  });

  it('rejects non-overlapping windows', () => {
    expect(gameSlotIntervalsOverlap(t0, t1, t2, t3)).toBe(false);
  });

  it('rejects invalid windows', () => {
    expect(gameSlotIntervalsOverlap(t1, t1, t1, t2)).toBe(false);
    expect(gameSlotIntervalsOverlap(t2, t1, t1, t2)).toBe(false);
    expect(gameSlotIntervalsOverlap('not-a-date', t2, t1, t2)).toBe(false);
  });
});

describe('occupancyBlocksSlot', () => {
  it('treats PLAYING overlap as busy', () => {
    expect(
      occupancyBlocksSlot(
        occupancy({ gameId: 'other', startTime: t0, endTime: t2 }),
        target,
      ),
    ).toBe(true);
  });

  it('does not treat INVITED or IN_QUEUE as occupying the slot', () => {
    expect(occupancyBlocksSlot(occupancy({ gameId: 'other', status: 'INVITED' }), target)).toBe(false);
    expect(occupancyBlocksSlot(occupancy({ gameId: 'other', status: 'IN_QUEUE' }), target)).toBe(false);
  });

  it('ignores finished games, bars, unset time, and the target game itself', () => {
    expect(occupancyBlocksSlot(occupancy({ gameId: 'other', gameStatus: 'FINISHED' }), target)).toBe(false);
    expect(occupancyBlocksSlot(occupancy({ gameId: 'other', entityType: 'BAR' }), target)).toBe(false);
    expect(occupancyBlocksSlot(occupancy({ gameId: 'other', timeIsSet: false }), target)).toBe(false);
    expect(occupancyBlocksSlot(occupancy({ gameId: 'target' }), target)).toBe(false);
    expect(occupancyBlocksSlot(occupancy({ gameId: 'other' }), { ...target, timeIsSet: false })).toBe(
      false,
    );
  });
});

describe('userIdsBusyInSlot', () => {
  it('omits users whose PLAYING window overlaps the target', () => {
    const ids = userIdsBusyInSlot(
      [
        { ...occupancy({ gameId: 'a', startTime: t0, endTime: t2 }), userId: 'busy' },
        { ...occupancy({ gameId: 'b', startTime: t2, endTime: t3 }), userId: 'free-touch' },
        { ...occupancy({ gameId: 'c', status: 'INVITED' }), userId: 'invited' },
        { ...occupancy({ gameId: 'd', startTime: t0, endTime: t1 }), userId: 'free-before' },
      ],
      target,
    );
    expect(ids).toEqual(['busy']);
  });
});
