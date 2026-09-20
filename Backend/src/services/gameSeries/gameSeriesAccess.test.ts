import assert from 'node:assert';
import {
  canRemoveSeriesRegular,
  evaluateSeriesSeatClaim,
  isSeriesInsider,
  isSeriesManager,
} from './gameSeriesAccess';

/**
 * PRD 345 — regression tests for the series authorization chain.
 *
 * The attack these lock out, end to end:
 *
 *   1. `GET /games/<anyGameId>/series-next` hands a stranger the series id,
 *      the owner and the next occurrence's id.
 *   2. `POST /series/<seriesId>/regulars` with an empty body self-adds them to
 *      the regular roster.
 *   3. `POST /games/<nextId>/series-next {"action":"accept"}` seats them
 *      PLAYING on a private, level-gated game without any join validation.
 *   4. `POST /series/<seriesId>/chat` syncs them into the private group chat.
 *
 * Every step is refused below.
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

const OWNER = 'owner-1';
const REGULAR = 'regular-1';
const ATTACKER = 'attacker-1';
const NEXT_GAME = 'game-next';
const OTHER_GAME = 'game-somewhere-else';

// ---------------------------------------------------------------------------
// Step 2 — the regular roster is owner-managed, self-add included.
// ---------------------------------------------------------------------------

check('a stranger cannot manage the roster (no self-add shortcut)', () => {
  assert.equal(isSeriesManager({ seriesOwnerId: OWNER, actorId: ATTACKER }), false);
  // The controller defaults the target to the caller; that default must not
  // buy the caller anything.
  assert.equal(
    isSeriesManager({ seriesOwnerId: OWNER, actorId: ATTACKER, isAdmin: false }),
    false,
    'actorId === targetUserId must not skip the ownership assertion',
  );
});

check('owner and platform admin may manage the roster', () => {
  assert.equal(isSeriesManager({ seriesOwnerId: OWNER, actorId: OWNER }), true);
  assert.equal(isSeriesManager({ seriesOwnerId: OWNER, actorId: ATTACKER, isAdmin: true }), true);
});

check('an unresolved actor fails closed', () => {
  assert.equal(isSeriesManager({ seriesOwnerId: OWNER, actorId: null }), false);
  assert.equal(isSeriesManager({ seriesOwnerId: OWNER, actorId: undefined }), false);
  assert.equal(isSeriesManager({ seriesOwnerId: OWNER, actorId: '' }), false);
  assert.equal(
    isSeriesManager({ seriesOwnerId: '', actorId: '' }),
    false,
    'two empty ids must not compare equal into ownership',
  );
});

check('self-removal is allowed, removing someone else is not (user story 18)', () => {
  assert.equal(
    canRemoveSeriesRegular({
      seriesOwnerId: OWNER,
      actorId: REGULAR,
      targetUserId: REGULAR,
    }),
    true,
  );
  assert.equal(
    canRemoveSeriesRegular({
      seriesOwnerId: OWNER,
      actorId: ATTACKER,
      targetUserId: REGULAR,
    }),
    false,
  );
  assert.equal(
    canRemoveSeriesRegular({
      seriesOwnerId: OWNER,
      actorId: OWNER,
      targetUserId: REGULAR,
    }),
    true,
  );
  assert.equal(
    canRemoveSeriesRegular({ seriesOwnerId: OWNER, actorId: null, targetUserId: REGULAR }),
    false,
  );
});

// ---------------------------------------------------------------------------
// Step 1 / 4 — series-private payloads are for insiders only.
// ---------------------------------------------------------------------------

const insider = (over: Partial<Parameters<typeof isSeriesInsider>[0]> = {}) =>
  isSeriesInsider({
    viewerId: ATTACKER,
    seriesOwnerId: OWNER,
    viewerIsActiveRegular: false,
    viewerIsOccurrenceParticipant: false,
    ...over,
  });

check('a stranger sees no roster, no owner and no next-occurrence id', () => {
  assert.equal(insider(), false);
});

check('owner, admin, active regular and occurrence participant are insiders', () => {
  assert.equal(insider({ viewerId: OWNER }), true);
  assert.equal(insider({ isAdmin: true }), true);
  assert.equal(insider({ viewerIsActiveRegular: true }), true);
  assert.equal(insider({ viewerIsOccurrenceParticipant: true }), true);
});

check('a removed regular with no participation is no longer an insider', () => {
  assert.equal(
    insider({ viewerId: REGULAR, viewerIsActiveRegular: false }),
    false,
    'removedAt must drop insider status',
  );
});

check('an unresolved viewer fails closed', () => {
  assert.equal(insider({ viewerId: null, viewerIsActiveRegular: true }), false);
  assert.equal(insider({ viewerId: '', viewerIsOccurrenceParticipant: true }), false);
});

// ---------------------------------------------------------------------------
// Step 3 — the carry-over seat.
// ---------------------------------------------------------------------------

const claim = (over: Partial<Parameters<typeof evaluateSeriesSeatClaim>[0]> = {}) =>
  evaluateSeriesSeatClaim({
    actorId: REGULAR,
    seriesOwnerId: OWNER,
    seriesStatus: 'ACTIVE',
    actorIsActiveRegular: true,
    requestedGameId: NEXT_GAME,
    nextOccurrenceId: NEXT_GAME,
    ...over,
  });

check('an active regular may claim the next occurrence', () => {
  assert.deepStrictEqual(claim(), { allowed: true });
});

check('a non-regular is refused even with a valid next-occurrence id', () => {
  assert.deepStrictEqual(claim({ actorId: ATTACKER, actorIsActiveRegular: false }), {
    allowed: false,
    refusal: 'errors.series.notARegular',
  });
});

check('a removed regular is refused', () => {
  assert.deepStrictEqual(claim({ actorIsActiveRegular: false }), {
    allowed: false,
    refusal: 'errors.series.notARegular',
  });
});

check('the series owner may claim their own occurrence', () => {
  assert.deepStrictEqual(claim({ actorId: OWNER, actorIsActiveRegular: false }), {
    allowed: true,
  });
});

check('an out-of-band gameId is refused, even from a real regular', () => {
  assert.deepStrictEqual(claim({ requestedGameId: OTHER_GAME }), {
    allowed: false,
    refusal: 'errors.series.notNextOccurrence',
  });
  assert.deepStrictEqual(
    claim({ requestedGameId: OTHER_GAME, nextOccurrenceId: OTHER_GAME }),
    { allowed: true },
    'the check is "equals the id the server resolved", not "is some game of the series"',
  );
});

check('no next occurrence means nothing to claim', () => {
  assert.deepStrictEqual(claim({ nextOccurrenceId: null }), {
    allowed: false,
    refusal: 'errors.series.occurrenceClosed',
  });
});

check('an ended series refuses every claim', () => {
  assert.deepStrictEqual(claim({ seriesStatus: 'ENDED' }), {
    allowed: false,
    refusal: 'errors.series.occurrenceClosed',
  });
  assert.deepStrictEqual(claim({ actorId: OWNER, seriesStatus: 'ENDED' }), {
    allowed: false,
    refusal: 'errors.series.occurrenceClosed',
  });
});

check('an unresolved actor fails closed on the seat claim', () => {
  assert.deepStrictEqual(claim({ actorId: null }), {
    allowed: false,
    refusal: 'errors.series.notARegular',
  });
  assert.deepStrictEqual(claim({ actorId: '', actorIsActiveRegular: true }), {
    allowed: false,
    refusal: 'errors.series.notARegular',
  });
  assert.deepStrictEqual(
    claim({ actorId: '', seriesOwnerId: '', actorIsActiveRegular: false }),
    { allowed: false, refusal: 'errors.series.notARegular' },
    'an empty actor must not match an empty owner id',
  );
});

if (failures > 0) {
  console.error(`\n${failures} assertion group(s) failed`);
  process.exit(1);
}
console.log('\nAll gameSeriesAccess authorization checks passed');
