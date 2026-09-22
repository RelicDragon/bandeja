import assert from 'node:assert/strict';
import { SpotOpenedKind } from '@prisma/client';
import {
  buildSpotOpenedRecipients,
  queuePosition,
} from './spotOpenedRecipients';
import { orderQueueByJoinedAt, selectAutoFillCandidate } from './autoFillCandidates';
import { SPOT_OPENED_WINDOW_MS, isWithinSpotOpenedWindow } from './spotOpenedWindow';
import { sendWithBackoff, type SendAttemptResult } from './spotOpenedRetry';
import { formatLevelRange } from './spotOpenedNotifyCopy';

// ---------------------------------------------------------------------------
// recipient sets — PRD 347 "Recipient sets" + "Empty and edge states"
// ---------------------------------------------------------------------------

const base = {
  queueUserIds: ['q1', 'q2'],
  intentUserIds: ['i1'],
  followerUserIds: ['f1'],
  ownerUserId: 'owner',
  isPublic: true,
  seatedUserIds: ['owner', 'p2'],
};

{
  const recipients = buildSpotOpenedRecipients(base);
  assert.deepEqual(
    recipients,
    [
      { userId: 'q1', kind: SpotOpenedKind.QUEUE },
      { userId: 'q2', kind: SpotOpenedKind.QUEUE },
      { userId: 'i1', kind: SpotOpenedKind.INTENT },
      { userId: 'f1', kind: SpotOpenedKind.FOLLOWER },
    ],
    'queue first, then intents, then followers',
  );
}

// The owner is never told about their own game, in any bucket.
{
  const recipients = buildSpotOpenedRecipients({
    ...base,
    queueUserIds: ['owner', 'q1'],
    intentUserIds: ['owner'],
    followerUserIds: ['owner'],
  });
  assert.deepEqual(recipients.map((r) => r.userId), ['q1']);
}

// A user who is both queued and a matching intent gets exactly one copy, the
// higher-priority one.
{
  const recipients = buildSpotOpenedRecipients({
    ...base,
    queueUserIds: ['dual'],
    intentUserIds: ['dual'],
    followerUserIds: ['dual'],
  });
  assert.deepEqual(recipients, [{ userId: 'dual', kind: SpotOpenedKind.QUEUE }]);
}

// Private game: queue members only.
{
  const recipients = buildSpotOpenedRecipients({ ...base, isPublic: false });
  assert.deepEqual(recipients.map((r) => r.kind), [
    SpotOpenedKind.QUEUE,
    SpotOpenedKind.QUEUE,
  ]);
}

// Anyone already holding a seat is skipped — a PLAYING player is never invited back.
{
  const recipients = buildSpotOpenedRecipients({
    ...base,
    intentUserIds: ['p2', 'i1'],
  });
  assert.deepEqual(
    recipients.filter((r) => r.kind === SpotOpenedKind.INTENT).map((r) => r.userId),
    ['i1'],
  );
}

assert.equal(queuePosition(['a', 'b', 'c'], 'b'), 2);
assert.equal(queuePosition(['a'], 'zzz'), null);

// ---------------------------------------------------------------------------
// auto-fill candidate selection — gates + fallback to the next queued player
// ---------------------------------------------------------------------------

const queue = [
  { userId: 'third', joinedAt: '2026-01-01T12:00:00.000Z' },
  { userId: 'first', joinedAt: '2026-01-01T10:00:00.000Z' },
  { userId: 'second', joinedAt: '2026-01-01T11:00:00.000Z' },
];

assert.deepEqual(
  orderQueueByJoinedAt(queue).map((q) => q.userId),
  ['first', 'second', 'third'],
  'queue order is joinedAt ascending — there is no order column',
);

void (async () => {
  // Exactly one promotion, and it is the first in line.
  const seen: string[] = [];
  const picked = await selectAutoFillCandidate(queue, async (c) => {
    seen.push(c.userId);
    return true;
  });
  assert.equal(picked?.userId, 'first');
  assert.deepEqual(seen, ['first'], 'stops at the first eligible candidate');

  // First fails a gate → the next queued player is tried.
  const fallback = await selectAutoFillCandidate(queue, async (c) => c.userId !== 'first');
  assert.equal(fallback?.userId, 'second');

  // A gate that throws (malformed profile) is a rejection, not an abort.
  const thrower = await selectAutoFillCandidate(queue, async (c) => {
    if (c.userId === 'first') throw new Error('no sport profile');
    return c.userId === 'third';
  });
  assert.equal(thrower?.userId, 'third');

  // Nobody qualifies → fall through to notifications.
  assert.equal(await selectAutoFillCandidate(queue, async () => false), null);
  assert.equal(await selectAutoFillCandidate([], async () => true), null);

  // -------------------------------------------------------------------------
  // retry / backoff
  // -------------------------------------------------------------------------

  const slept: number[] = [];
  const sleep = async (ms: number) => {
    slept.push(ms);
  };

  let calls = 0;
  const flaky = async (): Promise<SendAttemptResult> => {
    calls += 1;
    return calls < 3 ? { delivered: false } : { delivered: true };
  };
  assert.deepEqual(await sendWithBackoff(flaky, [1, 2], sleep), { delivered: true });
  assert.equal(calls, 3, 'one attempt plus two retries');
  assert.deepEqual(slept, [1, 2]);

  let permanentCalls = 0;
  const permanent = async (): Promise<SendAttemptResult> => {
    permanentCalls += 1;
    return { delivered: false, permanent: true };
  };
  await sendWithBackoff(permanent, [1, 2], sleep);
  assert.equal(permanentCalls, 1, 'a permanent failure is never retried');

  let throwCalls = 0;
  const throwing = async (): Promise<SendAttemptResult> => {
    throwCalls += 1;
    throw new Error('boom');
  };
  assert.deepEqual(
    await sendWithBackoff(throwing, [1], sleep),
    { delivered: false },
    'a throwing attempt never escapes the helper',
  );
  assert.equal(throwCalls, 2);

  // -------------------------------------------------------------------------
  // 2 h window
  // -------------------------------------------------------------------------

  const now = new Date('2026-01-01T12:00:00.000Z');
  assert.equal(SPOT_OPENED_WINDOW_MS, 2 * 60 * 60 * 1000);
  assert.equal(isWithinSpotOpenedWindow(now, now), true);
  assert.equal(
    isWithinSpotOpenedWindow(new Date(now.getTime() - SPOT_OPENED_WINDOW_MS + 1), now),
    true,
  );
  assert.equal(
    isWithinSpotOpenedWindow(new Date(now.getTime() - SPOT_OPENED_WINDOW_MS - 1), now),
    false,
    'expired events never raise the pill',
  );
  assert.equal(isWithinSpotOpenedWindow(null, now), false);
  assert.equal(isWithinSpotOpenedWindow('not-a-date', now), false);
  assert.equal(
    isWithinSpotOpenedWindow(new Date(now.getTime() + 60_000), now),
    false,
    'clock skew into the future is not a live event',
  );

  // -------------------------------------------------------------------------
  // push body level line
  // -------------------------------------------------------------------------

  assert.equal(formatLevelRange(3.5, 4.5), '3.5–4.5');
  assert.equal(formatLevelRange(3.5, null), '3.5+');
  assert.equal(formatLevelRange(null, 4.5), '≤4.5');
  assert.equal(formatLevelRange(null, null), null);

  // Games created before the band was snapped store the host's raw rating
  // ± 0.7, which must not reach the push body.
  assert.equal(
    formatLevelRange(2.045097134590984, 3.445097134590984),
    '2.0–3.4',
  );
  assert.equal(formatLevelRange(2.045097134590984, null), '2.0+');
  assert.equal(formatLevelRange(null, 3.445097134590984), '≤3.4');
  assert.equal(formatLevelRange(3, 4), '3.0–4.0');

  console.log('gameSeat.unit.test.ts: ok');
})();
