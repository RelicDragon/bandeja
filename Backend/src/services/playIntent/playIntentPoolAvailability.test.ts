import assert from 'node:assert/strict';
import { derivePlayIntentPoolAvailability } from './playIntentPoolAvailability';

{
  const availability = derivePlayIntentPoolAvailability({
    partySize: 4,
    viewerIsAvailable: true,
    proposalMemberCount: null,
    members: [
      { affinity: 'near', status: 'OPEN', busyInGame: false },
      { affinity: 'near', status: 'MATCHED', busyInGame: false },
      { affinity: 'near', status: 'MATCHED', busyInGame: false },
      { affinity: 'mid', status: 'MATCHED', busyInGame: false },
      { affinity: 'mid', status: 'MATCHED', busyInGame: false },
      { affinity: 'near', status: 'MATCHED', busyInGame: false },
      { affinity: 'mid', status: 'MATCHED', busyInGame: false },
      { affinity: 'near', status: 'MATCHED', busyInGame: false },
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
      { affinity: 'near', status: 'MATCHED', busyInGame: false },
      { affinity: 'mid', status: 'MATCHED', busyInGame: false },
      { affinity: 'near', status: 'OPEN', busyInGame: false },
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
      { affinity: 'near', status: 'MATCHED', busyInGame: false },
      { affinity: 'near', status: 'MATCHED', busyInGame: false },
      { affinity: 'near', status: 'MATCHED', busyInGame: false },
    ],
  });

  assert.deepEqual(
    availability,
    { availableCount: 3, clusterProgress: 4 },
    'an existing proposal reports its roster while its players remain free until a game exists',
  );
}

{
  const availability = derivePlayIntentPoolAvailability({
    partySize: 4,
    viewerIsAvailable: true,
    proposalMemberCount: null,
    members: [
      { affinity: 'near', status: 'MATCHED', busyInGame: false },
      { affinity: 'near', status: 'OPEN', busyInGame: true },
      { affinity: 'mid', status: 'MATCHED', busyInGame: true },
    ],
  });

  assert.deepEqual(
    availability,
    { availableCount: 1, clusterProgress: 2 },
    'only an actual game removes an otherwise compatible player from availability',
  );
}

console.log('playIntentPoolAvailability.test.ts: ok');
