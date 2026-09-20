import assert from 'node:assert';
import {
  GAME_SERIES_EDIT_SCOPES,
  isGameSeriesEditScope,
  partitionOccurrencesForFutureEdit,
  selectCarryOverRecipients,
  selectDeletableOccurrences,
  type OccurrenceForScope,
} from './gameSeriesEditScope';
import {
  buildGameSeriesTemplate,
  buildOccurrenceCreatePayload,
  mergeGameSeriesTemplate,
  parseGameSeriesTemplate,
  withAnchorDayKey,
} from './gameSeriesTemplate';

/**
 * PRD 345 — edit scope, template allow-list and carry-over recipient selection.
 *
 * All three are pure. `resultsStatus !== 'NONE'` is the mutation lock
 * (docs/product/constraints.md) — never `Game.status` — and the first block
 * below is what proves a "this and future" edit honours it.
 */

let failures = 0;
function check(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${error instanceof Error ? error.message : String(error)}`);
  }
}

const NOW = new Date('2026-09-22T12:00:00.000Z');

function occurrence(
  id: string,
  dayKey: string,
  startTime: string,
  resultsStatus = 'NONE',
  status = 'ANNOUNCED',
): OccurrenceForScope {
  return {
    id,
    occurrenceDayKey: dayKey,
    startTime: new Date(startTime),
    resultsStatus,
    status,
  };
}

console.log('gameSeriesEditScope');

check('scope guard accepts exactly the two documented scopes', () => {
  assert.deepStrictEqual([...GAME_SERIES_EDIT_SCOPES], ['occurrence', 'future']);
  assert.strictEqual(isGameSeriesEditScope('occurrence'), true);
  assert.strictEqual(isGameSeriesEditScope('future'), true);
  assert.strictEqual(isGameSeriesEditScope('all'), false);
  assert.strictEqual(isGameSeriesEditScope(undefined), false);
});

check('partition: history is never touched', () => {
  const { applicable, locked, started } = partitionOccurrencesForFutureEdit({
    occurrences: [
      occurrence('past-1', '2026-09-08', '2026-09-08T17:00:00.000Z', 'FINAL', 'FINISHED'),
      occurrence('past-2', '2026-09-15', '2026-09-15T17:00:00.000Z', 'FINAL', 'FINISHED'),
      occurrence('next', '2026-09-29', '2026-09-29T17:00:00.000Z'),
    ],
    fromDayKey: '2026-09-22',
    now: NOW,
  });
  assert.deepStrictEqual(applicable.map((o) => o.id), ['next']);
  assert.deepStrictEqual(locked.map((o) => o.id), []);
  assert.deepStrictEqual(started.map((o) => o.id), []);
});

check('partition: results lock wins over the clock', () => {
  const { applicable, locked } = partitionOccurrencesForFutureEdit({
    occurrences: [
      // In the future but someone already started entering results.
      occurrence('locked', '2026-09-29', '2026-09-29T17:00:00.000Z', 'IN_PROGRESS'),
      occurrence('free', '2026-10-06', '2026-10-06T17:00:00.000Z', 'NONE'),
    ],
    fromDayKey: '2026-09-22',
    now: NOW,
  });
  assert.deepStrictEqual(locked.map((o) => o.id), ['locked']);
  assert.deepStrictEqual(applicable.map((o) => o.id), ['free']);
});

check('partition: today-but-already-started lands in `started`, not `applicable`', () => {
  const { applicable, started } = partitionOccurrencesForFutureEdit({
    occurrences: [
      occurrence('this-morning', '2026-09-22', '2026-09-22T08:00:00.000Z'),
      occurrence('tonight', '2026-09-22', '2026-09-22T17:00:00.000Z'),
    ],
    fromDayKey: '2026-09-22',
    now: NOW,
  });
  assert.deepStrictEqual(started.map((o) => o.id), ['this-morning']);
  assert.deepStrictEqual(applicable.map((o) => o.id), ['tonight']);
});

check('partition: archived occurrences are never rewritten', () => {
  const { applicable, started } = partitionOccurrencesForFutureEdit({
    occurrences: [
      occurrence('archived', '2026-10-06', '2026-10-06T17:00:00.000Z', 'NONE', 'ARCHIVED'),
    ],
    fromDayKey: '2026-09-22',
    now: NOW,
  });
  assert.deepStrictEqual(applicable, []);
  assert.deepStrictEqual(started.map((o) => o.id), ['archived']);
});

check('end-series deletes only future, results-free occurrences', () => {
  const { deletable, kept } = selectDeletableOccurrences(
    [
      occurrence('past', '2026-09-15', '2026-09-15T17:00:00.000Z', 'FINAL', 'FINISHED'),
      occurrence('future-locked', '2026-09-29', '2026-09-29T17:00:00.000Z', 'IN_PROGRESS'),
      occurrence('future-free', '2026-10-06', '2026-10-06T17:00:00.000Z'),
    ],
    NOW,
  );
  assert.deepStrictEqual(deletable.map((o) => o.id), ['future-free']);
  assert.deepStrictEqual(kept.map((o) => o.id).sort(), ['future-locked', 'past']);
});

console.log('gameSeriesTemplate');

const SOURCE_GAME = {
  id: 'game-1',
  sport: 'PADEL',
  entityType: 'GAME',
  gameType: 'CLASSIC',
  name: 'Tuesday Regulars',
  description: 'Bring water',
  cityId: 'city-1',
  maxParticipants: 4,
  minParticipants: 4,
  isPublic: true,
  affectsRating: true,
  minLevel: 2.5,
  maxLevel: 4,
  priceType: 'FIXED',
  priceTotal: 40,
  priceCurrency: 'EUR',
  // Things that must never survive into the template:
  startTime: new Date('2026-09-22T17:00:00.000Z'),
  endTime: new Date('2026-09-22T18:30:00.000Z'),
  clubId: 'club-1',
  resultsStatus: 'NONE',
  participants: [{ userId: 'u1' }],
};

check('buildGameSeriesTemplate keeps the allow-list and drops everything else', () => {
  const template = buildGameSeriesTemplate(SOURCE_GAME, '2026-09-22');
  assert.strictEqual(template.anchorDayKey, '2026-09-22');
  assert.strictEqual(template.sport, 'PADEL');
  assert.strictEqual(template.maxParticipants, 4);
  assert.strictEqual(template.cityId, 'city-1');
  assert.strictEqual(template.priceCurrency, 'EUR');

  const asRecord = template as unknown as Record<string, unknown>;
  assert.strictEqual('startTime' in asRecord, false, 'schedule must not be pinned');
  assert.strictEqual('endTime' in asRecord, false);
  assert.strictEqual('clubId' in asRecord, false, 'club lives on the series row');
  assert.strictEqual('participants' in asRecord, false);
  assert.strictEqual('resultsStatus' in asRecord, false);
  assert.strictEqual('id' in asRecord, false);
});

check('buildGameSeriesTemplate refuses an invalid anchor or a missing identity', () => {
  assert.throws(() => buildGameSeriesTemplate(SOURCE_GAME, '22-09-2026'), RangeError);
  assert.throws(
    () => buildGameSeriesTemplate({ entityType: 'GAME', maxParticipants: 4 }, '2026-09-22'),
    RangeError,
  );
});

check('parseGameSeriesTemplate round-trips and rejects junk', () => {
  const template = buildGameSeriesTemplate(SOURCE_GAME, '2026-09-22');
  const parsed = parseGameSeriesTemplate(JSON.parse(JSON.stringify(template)));
  assert.ok(parsed);
  assert.strictEqual(parsed?.name, 'Tuesday Regulars');
  assert.strictEqual(parseGameSeriesTemplate(null), null);
  assert.strictEqual(parseGameSeriesTemplate([1, 2, 3]), null);
  assert.strictEqual(parseGameSeriesTemplate({ anchorDayKey: 'nope' }), null);
});

check('mergeGameSeriesTemplate patches only allow-listed keys', () => {
  const template = buildGameSeriesTemplate(SOURCE_GAME, '2026-09-22');
  const merged = mergeGameSeriesTemplate(template, {
    name: 'Tuesday Regulars v2',
    maxParticipants: 8,
    clubId: 'club-hijack',
    startTime: '2027-01-01T00:00:00.000Z',
  });
  assert.strictEqual(merged.name, 'Tuesday Regulars v2');
  assert.strictEqual(merged.maxParticipants, 8);
  assert.strictEqual(merged.anchorDayKey, '2026-09-22');
  const asRecord = merged as unknown as Record<string, unknown>;
  assert.strictEqual('clubId' in asRecord, false);
  assert.strictEqual('startTime' in asRecord, false);
  // Untouched keys survive.
  assert.strictEqual(merged.priceCurrency, 'EUR');
});

check('withAnchorDayKey moves the cadence phase and validates', () => {
  const template = buildGameSeriesTemplate(SOURCE_GAME, '2026-09-22');
  assert.strictEqual(withAnchorDayKey(template, '2026-09-24').anchorDayKey, '2026-09-24');
  assert.throws(() => withAnchorDayKey(template, 'tuesday'), RangeError);
});

check('buildOccurrenceCreatePayload resolves the schedule and never auto-books', () => {
  const template = buildGameSeriesTemplate(SOURCE_GAME, '2026-09-22');
  const payload = buildOccurrenceCreatePayload({
    template,
    startTime: new Date('2026-09-29T17:00:00.000Z'),
    endTime: new Date('2026-09-29T18:30:00.000Z'),
    clubId: 'club-1',
    courtIds: ['court-a', 'court-b'],
    cityId: 'city-1',
    ownerParticipates: true,
    ownerUserId: 'owner-1',
  });

  assert.strictEqual(payload.startTime, '2026-09-29T17:00:00.000Z');
  assert.strictEqual(payload.endTime, '2026-09-29T18:30:00.000Z');
  assert.strictEqual(payload.timeIsSet, true);
  assert.strictEqual(payload.clubId, 'club-1');
  assert.deepStrictEqual(payload.courtIds, ['court-a', 'court-b']);
  assert.strictEqual(payload.courtId, 'court-a');
  assert.strictEqual(payload.hasBookedCourt, false, 'auto-booking is out of scope');
  assert.strictEqual(payload.confirmOverlap, true);
  assert.deepStrictEqual(payload.participants, ['owner-1']);
  assert.strictEqual('anchorDayKey' in payload, false);
});

check('buildOccurrenceCreatePayload omits courts and the owner when there are none', () => {
  const template = buildGameSeriesTemplate(SOURCE_GAME, '2026-09-22');
  const payload = buildOccurrenceCreatePayload({
    template,
    startTime: new Date('2026-09-29T17:00:00.000Z'),
    endTime: new Date('2026-09-29T18:30:00.000Z'),
    clubId: null,
    courtIds: [],
    cityId: null,
    ownerParticipates: false,
    ownerUserId: 'owner-1',
  });
  assert.strictEqual('courtIds' in payload, false);
  assert.strictEqual('courtId' in payload, false);
  assert.strictEqual('clubId' in payload, false);
  assert.deepStrictEqual(payload.participants, []);
});

console.log('gameSeriesCarryOver');

check('carry-over prompts regulars who played and are not seated yet', () => {
  assert.deepStrictEqual(
    selectCarryOverRecipients({
      playedHere: ['ann', 'bob', 'cara', 'dave'],
      regulars: ['ann', 'bob', 'cara', 'erin'],
      alreadyOnNext: ['cara'],
    }),
    ['ann', 'bob'],
  );
});

check('carry-over never prompts a non-regular, an absentee or a duplicate', () => {
  assert.deepStrictEqual(
    selectCarryOverRecipients({
      playedHere: ['ann', 'ann', 'zoe'],
      regulars: ['ann', 'erin'],
      alreadyOnNext: [],
    }),
    ['ann'],
    'duplicates collapse and a guest is not a regular',
  );
  assert.deepStrictEqual(
    selectCarryOverRecipients({
      playedHere: [],
      regulars: ['ann', 'bob'],
      alreadyOnNext: [],
    }),
    [],
    'a regular who sat this one out is not nudged',
  );
});

check('carry-over is idempotent once everyone has accepted', () => {
  assert.deepStrictEqual(
    selectCarryOverRecipients({
      playedHere: ['ann', 'bob'],
      regulars: ['ann', 'bob'],
      alreadyOnNext: ['ann', 'bob'],
    }),
    [],
  );
});

if (failures > 0) {
  console.error(`\n${failures} assertion group(s) failed`);
  process.exit(1);
}
console.log('\nAll gameSeriesEditScope / template / carry-over checks passed');
