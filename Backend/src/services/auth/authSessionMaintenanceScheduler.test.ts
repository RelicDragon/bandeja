import assert from 'node:assert/strict';
import {
  shouldAlertAuthRefreshWindow,
  summarizeAuthRefreshWindow,
} from './authSessionMaintenanceScheduler.service';

const healthy = summarizeAuthRefreshWindow(
  Array.from({ length: 20 }, () => ({ outcome: 'success', platform: 'ios', durationMs: 100 }))
);
assert.equal(healthy.failurePercent, 0);
assert.equal(shouldAlertAuthRefreshWindow(healthy), false);

const degraded = summarizeAuthRefreshWindow([
  ...Array.from({ length: 15 }, () => ({ outcome: 'success', platform: 'web', durationMs: 100 })),
  ...Array.from({ length: 5 }, () => ({ outcome: 'refreshInvalid', platform: 'android', durationMs: 300 })),
]);
assert.equal(degraded.failurePercent, 25);
assert.equal(degraded.platforms.android, 5);
assert.equal(shouldAlertAuthRefreshWindow(degraded), true);

console.log('authSessionMaintenanceScheduler.test.ts: ok');
