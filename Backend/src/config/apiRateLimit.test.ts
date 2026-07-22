import assert from 'node:assert/strict';
import {
  DEFAULT_API_RATE_LIMIT_MAX_DEVELOPMENT,
  DEFAULT_API_RATE_LIMIT_MAX_PRODUCTION,
  DEFAULT_API_RATE_LIMIT_SKIP_SUBSTRINGS,
  DEFAULT_API_RATE_LIMIT_WINDOW_MS,
  resolveApiRateLimitConfig,
  shouldSkipApiRateLimit,
} from './apiRateLimit';

function run() {
  const prod = resolveApiRateLimitConfig({ nodeEnv: 'production' });
  assert.equal(prod.max, DEFAULT_API_RATE_LIMIT_MAX_PRODUCTION);
  assert.equal(prod.windowMs, DEFAULT_API_RATE_LIMIT_WINDOW_MS);
  assert.deepEqual(prod.skipPathSubstrings, [...DEFAULT_API_RATE_LIMIT_SKIP_SUBSTRINGS]);

  const dev = resolveApiRateLimitConfig({ nodeEnv: 'development' });
  assert.equal(dev.max, DEFAULT_API_RATE_LIMIT_MAX_DEVELOPMENT);

  const override = resolveApiRateLimitConfig({
    nodeEnv: 'production',
    maxEnv: '500',
    windowMsEnv: '60000',
    skipPathSubstringsEnv: '/health,/custom',
  });
  assert.equal(override.max, 500);
  assert.equal(override.windowMs, 60000);
  assert.deepEqual(override.skipPathSubstrings, ['/health', '/custom']);

  const emptySkip = resolveApiRateLimitConfig({
    nodeEnv: 'production',
    skipPathSubstringsEnv: '',
  });
  assert.deepEqual(emptySkip.skipPathSubstrings, []);

  assert.equal(shouldSkipApiRateLimit('/chat/sync/events', prod.skipPathSubstrings), true);
  assert.equal(shouldSkipApiRateLimit('/chat/messages/missed', prod.skipPathSubstrings), true);
  assert.equal(shouldSkipApiRateLimit('/chat/unread-objects', prod.skipPathSubstrings), true);
  assert.equal(shouldSkipApiRateLimit('/auth/refresh', prod.skipPathSubstrings), true);
  assert.equal(shouldSkipApiRateLimit('/logs/stream', prod.skipPathSubstrings), true);
  assert.equal(shouldSkipApiRateLimit('/games/available', prod.skipPathSubstrings), false);
  assert.equal(shouldSkipApiRateLimit('/auth/login', prod.skipPathSubstrings), false);

  console.log('apiRateLimit.test.ts: ok');
}

run();
