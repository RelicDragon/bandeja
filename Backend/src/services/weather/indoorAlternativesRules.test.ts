/**
 * PRD 357 — "Move indoor" availability against occupancy fixtures.
 *
 * The fixtures are shaped exactly like `CourtOccupancyService.getOccupancy`
 * output, which merges app games, admin holds and the Booktime / Padeloo /
 * Klikteren snapshots (`docs/product/constraints.md`: NSPADELSUPABASE is not in
 * that merge, so nothing here pretends to know about it).
 */
import assert from 'node:assert/strict';
import type { OccupancyBlock } from '../game/courtOccupancy.service';
import {
  blockOverlapsWindow,
  selectIndoorAlternatives,
} from './indoorAlternativesRules';

const START = new Date('2026-09-21T17:00:00.000Z');
const END = new Date('2026-09-21T18:30:00.000Z');

const COURTS = [
  { id: 'court-1', name: 'Court 1' },
  { id: 'court-2', name: 'Court 2' },
  { id: 'court-3', name: 'Court 3' },
];

function block(overrides: Partial<OccupancyBlock> & { courtId: string }): OccupancyBlock {
  return {
    kind: 'game',
    courtName: null,
    integrationCourtName: null,
    startTime: START.toISOString(),
    endTime: END.toISOString(),
    hasBookedCourt: false,
    clubBooked: false,
    isFree: false,
    ...overrides,
  };
}

// --- overlap math -----------------------------------------------------------

assert.equal(
  blockOverlapsWindow(
    { startTime: '2026-09-21T18:30:00.000Z', endTime: '2026-09-21T20:00:00.000Z' },
    START,
    END,
  ),
  false,
  'a block starting exactly when the game ends does not overlap',
);
assert.equal(
  blockOverlapsWindow(
    { startTime: '2026-09-21T15:00:00.000Z', endTime: '2026-09-21T17:00:00.000Z' },
    START,
    END,
  ),
  false,
  'a block ending exactly when the game starts does not overlap',
);
assert.equal(
  blockOverlapsWindow(
    { startTime: '2026-09-21T18:00:00.000Z', endTime: '2026-09-21T19:00:00.000Z' },
    START,
    END,
  ),
  true,
  'a partial overlap still blocks the court',
);
assert.equal(
  blockOverlapsWindow({ startTime: 'not-a-date', endTime: 'nope' }, START, END),
  false,
  'a malformed block never blocks a court',
);

// --- selection --------------------------------------------------------------

{
  const rows = selectIndoorAlternatives({ courts: COURTS, blocks: [], start: START, end: END });
  assert.deepEqual(
    rows.map((row) => [row.id, row.isFree, row.busyKind]),
    [
      ['court-1', true, null],
      ['court-2', true, null],
      ['court-3', true, null],
    ],
    'with no occupancy every indoor court is free',
  );
}

{
  const rows = selectIndoorAlternatives({
    courts: COURTS,
    blocks: [
      block({ courtId: 'court-1', kind: 'game', gameId: 'other-game' }),
      block({ courtId: 'court-2', kind: 'external', clubBooked: true }),
      block({ courtId: 'court-3', kind: 'hold', holdBlocked: false }),
    ],
    start: START,
    end: END,
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  assert.equal(byId.get('court-1')!.isFree, false, 'another app game blocks the court');
  assert.equal(byId.get('court-1')!.busyKind, 'game');
  assert.equal(byId.get('court-2')!.isFree, false, 'a club booking blocks the court');
  assert.equal(byId.get('court-2')!.busyKind, 'external');
  assert.equal(
    byId.get('court-3')!.isFree,
    true,
    'a non-blocking admin hold leaves the court bookable',
  );
}

{
  const rows = selectIndoorAlternatives({
    courts: COURTS,
    blocks: [block({ courtId: 'court-1', kind: 'hold', holdBlocked: true })],
    start: START,
    end: END,
  });
  assert.equal(rows[0].isFree, false, 'a blocking admin hold blocks the court');
  assert.equal(rows[0].busyKind, 'hold');
}

{
  // A game partly indoors must not see its own block as "busy".
  const rows = selectIndoorAlternatives({
    courts: COURTS,
    blocks: [block({ courtId: 'court-2', kind: 'game', gameId: 'this-game' })],
    start: START,
    end: END,
    excludeGameId: 'this-game',
  });
  assert.equal(rows[1].isFree, true, "the game's own block never blocks its own court");
}

{
  const rows = selectIndoorAlternatives({
    courts: COURTS,
    blocks: [
      block({
        courtId: 'court-1',
        startTime: '2026-09-21T20:00:00.000Z',
        endTime: '2026-09-21T21:00:00.000Z',
        clubBooked: true,
      }),
      block({ courtId: null as unknown as string, clubBooked: true }),
    ],
    start: START,
    end: END,
  });
  assert.equal(rows[0].isFree, true, 'a block outside the window does not matter');
  assert.equal(
    rows.every((row) => row.isFree),
    true,
    'an unassigned-court block never blocks a named court',
  );
}

console.log('indoorAlternativesRules.test.ts: ok');
