import assert from 'node:assert/strict';
import {
  AVAILABLE_ENRICH_MAX_IDS,
  enrichAvailableGamesSafe,
} from './availableGamesEnrichment';

async function run() {
  assert.equal(AVAILABLE_ENRICH_MAX_IDS, 100);

  const core = [
    {
      id: 'g1',
      cityId: 'c1',
      startTime: new Date('2026-06-01T10:00:00.000Z'),
      endTime: new Date('2026-06-01T11:30:00.000Z'),
      timeIsSet: true,
      name: 'Core',
    },
  ];

  // Enrichment fan-out may fail; core cards must still round-trip.
  const result = await enrichAvailableGamesSafe('user-1', core);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'g1');
  assert.equal(result[0].name, 'Core');

  console.log('availableGamesEnrichment.test.ts: ok');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
