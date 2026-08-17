import assert from 'node:assert/strict';
import {
  shouldAlertAuthRefreshWindow,
  summarizeAuthRefreshWindow,
} from './authSessionMaintenanceScheduler.service';

const healthy = summarizeAuthRefreshWindow(
  Array.from({ length: 20 }, () => ({ outcome: 'success', platform: 'ios', durationMs: 100 }))
);
assert.equal(healthy.failurePercent, 0);
assert.equal(healthy.expectedFailures, 0);
assert.equal(shouldAlertAuthRefreshWindow(healthy), false);

const expectedClientRejects = summarizeAuthRefreshWindow([
  ...Array.from({ length: 14 }, () => ({ outcome: 'success', platform: 'web', durationMs: 8 })),
  ...Array.from({ length: 12 }, () => ({ outcome: 'refreshInvalid', platform: 'ios', durationMs: 8 })),
  ...Array.from({ length: 2 }, () => ({
    outcome: 'refreshTokenRequired',
    platform: 'web',
    durationMs: 8,
  })),
]);
assert.equal(expectedClientRejects.attempts, 28);
assert.equal(expectedClientRejects.failures, 0);
assert.equal(expectedClientRejects.expectedFailures, 14);
assert.equal(expectedClientRejects.failurePercent, 0);
assert.equal(shouldAlertAuthRefreshWindow(expectedClientRejects), false);

const infraDegraded = summarizeAuthRefreshWindow([
  ...Array.from({ length: 16 }, () => ({ outcome: 'success', platform: 'web', durationMs: 100 })),
  ...Array.from({ length: 4 }, () => ({ outcome: 'refreshBusy', platform: 'android', durationMs: 300 })),
]);
assert.equal(infraDegraded.failurePercent, 20);
assert.equal(shouldAlertAuthRefreshWindow(infraDegraded), true);

const now = Date.UTC(2026, 7, 17, 20, 0, 0);
assert.equal(shouldAlertAuthRefreshWindow(infraDegraded, now, now - 10 * 60 * 1000), false);
assert.equal(shouldAlertAuthRefreshWindow(infraDegraded, now, now - 61 * 60 * 1000), true);

console.log('authSessionMaintenanceScheduler.test.ts: ok');
