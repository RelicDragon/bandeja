import assert from 'node:assert/strict';
import { playIntentDiscoveryDateKeys } from './playIntentDiscoveryWindow';

assert.deepEqual(
  playIntentDiscoveryDateKeys('Europe/Prague', new Date('2026-07-30T15:59:00Z')),
  ['2026-07-30'],
);

assert.deepEqual(
  playIntentDiscoveryDateKeys('Europe/Prague', new Date('2026-07-30T16:00:00Z')),
  ['2026-07-30', '2026-07-31'],
);

assert.deepEqual(
  playIntentDiscoveryDateKeys('America/New_York', new Date('2026-07-31T01:00:00Z')),
  ['2026-07-30', '2026-07-31'],
);

console.log('playIntentDiscoveryWindow tests passed');
