import assert from 'node:assert/strict';
import { derivePlayIntentPoolAvailability } from './playIntentPoolAvailability';

{
  const availability = derivePlayIntentPoolAvailability({
    partySize: 4,
    viewerIsAvailable: true,
    proposalMemberCount: null,
    members: [
      { affinity: 'near', status: 'OPEN', inGame: false },
      { affinity: 'near', status: 'MATCHED', inGame: false },
      { affinity: 'near', status: 'MATCHED', inGame: false },
      { affinity: 'mid', status: 'MATCHED', inGame: false },
      { affinity: 'mid', status: 'MATCHED', inGame: false },
      { affinity: 'near', status: 'MATCHED', inGame: false },
      { affinity: 'mid', status: 'MATCHED', inGame: false },
      { affinity: 'near', status: 'MATCHED', inGame: false },
    ],
  });

  assert.deepEqual(
    availability,
    { availableCount: 8, clusterProgress: 4 },
    'pending proposals must not reserve players or remove them from lobby readiness',
  );
}

{
  const availability = derivePlayIntentPoolAvailability({
    partySize: 4,
    viewerIsAvailable: true,
    proposalMemberCount: null,
    members: [
      { affinity: 'near', status: 'MATCHED', inGame: false },
      { affinity: 'mid', status: 'MATCHED', inGame: false },
      { affinity: 'near', status: 'OPEN', inGame: false },
    ],
  });

  assert.deepEqual(
    availability,
    { availableCount: 3, clusterProgress: 4 },
    'a MATCHED viewer remains part of lobby readiness when no proposal is attached',
  );
}

{
  const availability = derivePlayIntentPoolAvailability({
    partySize: 4,
    viewerIsAvailable: true,
    proposalMemberCount: 4,
    members: [
      { affinity: 'near', status: 'MATCHED', inGame: false },
      { affinity: 'near', status: 'MATCHED', inGame: false },
      { affinity: 'near', status: 'MATCHED', inGame: false },
    ],
  });

  assert.deepEqual(
    availability,
    { availableCount: 3, clusterProgress: 4 },
    'an existing proposal reports its roster while its players remain free until a game exists',
  );
}

{
  // An in-game player with a live intent is still available — the intent is
  // the source of truth, the game is just context (signalled via a badge).
  // Only a far (incompatible) fit removes a player from availability.
  const availability = derivePlayIntentPoolAvailability({
    partySize: 4,
    viewerIsAvailable: true,
    proposalMemberCount: null,
    members: [
      { affinity: 'near', status: 'MATCHED', inGame: false },
      { affinity: 'near', status: 'OPEN', inGame: true },
      { affinity: 'mid', status: 'MATCHED', inGame: true },
    ],
  });

  assert.deepEqual(
    availability,
    { availableCount: 3, clusterProgress: 4 },
    'an in-game player with a live intent stays available; only far fits are excluded',
  );
}

console.log('playIntentPoolAvailability.test.ts: ok');
