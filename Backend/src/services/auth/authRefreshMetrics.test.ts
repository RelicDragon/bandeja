import assert from 'node:assert/strict';
import {
  authRefreshOutcomeFromCode,
  getAuthRefreshMetrics,
  recordAuthRefreshMetric,
  resetAuthRefreshMetricsForTests,
} from './authRefreshMetrics';

resetAuthRefreshMetricsForTests();
recordAuthRefreshMetric({ outcome: 'success', platform: 'ios', durationMs: 7_100 });
recordAuthRefreshMetric({ outcome: 'refreshInvalid', platform: 'android', durationMs: 100 });

assert.equal(authRefreshOutcomeFromCode('auth.refreshExpired'), 'refreshExpired');
assert.deepEqual(getAuthRefreshMetrics(), {
  attempts: 2,
  outcomes: {
    success: 1,
    refreshTokenRequired: 0,
    refreshInvalid: 1,
    refreshExpired: 0,
    refreshReused: 0,
    refreshBusy: 0,
    refreshRequestIdInvalid: 0,
    error: 0,
  },
  successesByPlatform: { web: 0, ios: 1, android: 0, unknown: 0 },
  durationMs: { average: 3_600, max: 7_100 },
});

console.log('auth refresh metrics tests passed');
