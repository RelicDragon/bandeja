import assert from 'node:assert/strict';
import {
  autoRemindKey,
  claimInState,
  manualRemindKey,
  nextClaimAt,
  parseReminderState,
  pruneReminderState,
  COST_REMINDER_STATE_KEY,
} from './costReminderDedupe';
import { PLATFORM_SETTING_KEY_PATTERN } from '../platformSetting.service';

/**
 * PRD 348 — the reminder dedupe must survive a restart (CONTRACT §5.4), so the
 * decision is a pure function over persisted state rather than an in-memory Set.
 */

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 0, 1);

// ---------------------------------------------------------------------------
// parsing whatever is in the row
// ---------------------------------------------------------------------------

assert.deepEqual(parseReminderState(null), {});
assert.deepEqual(parseReminderState(''), {});
assert.deepEqual(parseReminderState('not json'), {}, 'a corrupt row is not fatal');
assert.deepEqual(parseReminderState('[1,2]'), {}, 'an array is not a claim map');
assert.deepEqual(parseReminderState('{"a":1}'), { a: 1 });
assert.deepEqual(
  parseReminderState('{"a":"soon","b":2}'),
  { b: 2 },
  'non-numeric entries are dropped, the rest survives',
);

// ---------------------------------------------------------------------------
// claiming
// ---------------------------------------------------------------------------

{
  const first = claimInState({}, 'manual:g1', T0, DAY);
  assert.ok(first, 'the first nudge is allowed');
  assert.equal(first['manual:g1'], T0);

  assert.equal(
    claimInState(first, 'manual:g1', T0 + 60_000, DAY),
    null,
    'a second nudge a minute later is refused',
  );
  assert.equal(
    claimInState(first, 'manual:g1', T0 + DAY - 1, DAY),
    null,
    'still refused one millisecond short of the window',
  );

  const again = claimInState(first, 'manual:g1', T0 + DAY, DAY);
  assert.ok(again, 'allowed once the window has passed');
  assert.equal(again['manual:g1'], T0 + DAY);

  // A restart loses nothing: the same state, re-read, gives the same answer.
  const rehydrated = parseReminderState(JSON.stringify(first));
  assert.equal(claimInState(rehydrated, 'manual:g1', T0 + 60_000, DAY), null);
}

{
  // Different games never block each other.
  const state = claimInState({}, 'manual:g1', T0, DAY);
  assert.ok(state);
  assert.ok(claimInState(state, 'manual:g2', T0, DAY));
  // Nor do the automatic and the manual nudge for the same game.
  assert.ok(claimInState(state, autoRemindKey('g1'), T0, DAY));
}

assert.equal(manualRemindKey('g1'), 'manual:g1');
assert.equal(autoRemindKey('g1'), 'auto:g1');

// ---------------------------------------------------------------------------
// the row can never grow without bound
// ---------------------------------------------------------------------------

{
  const stale = { old: T0 - 2 * DAY, fresh: T0 - 1000 };
  assert.deepEqual(
    pruneReminderState(stale, T0, DAY),
    { fresh: T0 - 1000 },
    'expired claims are dropped',
  );
}

{
  const many: Record<string, number> = {};
  for (let i = 0; i < 500; i += 1) many[`g${i}`] = T0 - i;
  const pruned = pruneReminderState(many, T0, DAY, 10);
  assert.equal(Object.keys(pruned).length, 10);
  assert.ok(pruned.g0 != null, 'the newest claims are the ones kept');
  assert.equal(pruned.g499, undefined);
}

{
  // A claim prunes as it writes, so one busy day cannot blow the row up.
  let state: Record<string, number> = {};
  for (let i = 0; i < 40; i += 1) {
    const next = claimInState(state, `g${i}`, T0 + i, DAY);
    assert.ok(next);
    state = next;
  }
  const grown = pruneReminderState(state, T0, DAY, 10);
  assert.equal(Object.keys(grown).length, 10);
}

// ---------------------------------------------------------------------------
// the cooldown caption
// ---------------------------------------------------------------------------

assert.equal(nextClaimAt({}, 'manual:g1', T0, DAY), null, 'no claim, no cooldown');
assert.deepEqual(
  nextClaimAt({ 'manual:g1': T0 }, 'manual:g1', T0 + 1000, DAY),
  new Date(T0 + DAY),
);
assert.equal(
  nextClaimAt({ 'manual:g1': T0 }, 'manual:g1', T0 + DAY + 1, DAY),
  null,
  'an elapsed cooldown reads as "you may nudge now"',
);

// The fallback row must be a legal platform-setting key.
assert.match(COST_REMINDER_STATE_KEY, PLATFORM_SETTING_KEY_PATTERN);

console.log('costReminderDedupe.test.ts: ok');
