import assert from 'node:assert/strict';
import {
  DEFAULT_API_RATE_LIMIT_MAX_DEVELOPMENT,
  DEFAULT_API_RATE_LIMIT_MAX_PRODUCTION,
  DEFAULT_API_RATE_LIMIT_SKIP_PATH_PREFIXES,
  DEFAULT_API_RATE_LIMIT_WINDOW_MS,
  normalizeSkipPathPrefix,
  rateLimitPathname,
  resolveApiRateLimitConfig,
  shouldSkipApiRateLimit,
} from './apiRateLimit';

function run() {
  const prod = resolveApiRateLimitConfig({ nodeEnv: 'production' });
  assert.equal(prod.max, DEFAULT_API_RATE_LIMIT_MAX_PRODUCTION);
  assert.equal(prod.windowMs, DEFAULT_API_RATE_LIMIT_WINDOW_MS);
  assert.deepEqual(prod.skipPathPrefixes, [...DEFAULT_API_RATE_LIMIT_SKIP_PATH_PREFIXES]);

  const dev = resolveApiRateLimitConfig({ nodeEnv: 'development' });
  assert.equal(dev.max, DEFAULT_API_RATE_LIMIT_MAX_DEVELOPMENT);

  const override = resolveApiRateLimitConfig({
    nodeEnv: 'production',
    maxEnv: '500',
    windowMsEnv: '60000',
    skipPathPrefixesEnv: '/health,/custom,/,nope,auth/x',
  });
  assert.equal(override.max, 500);
  assert.equal(override.windowMs, 60000);
  assert.deepEqual(override.skipPathPrefixes, ['/health', '/custom']);

  const emptySkip = resolveApiRateLimitConfig({
    nodeEnv: 'production',
    skipPathPrefixesEnv: '',
  });
  assert.deepEqual(emptySkip.skipPathPrefixes, []);

  assert.equal(normalizeSkipPathPrefix('/'), null);
  assert.equal(normalizeSkipPathPrefix('relative'), null);
  assert.equal(normalizeSkipPathPrefix('/ok'), '/ok');

  assert.equal(rateLimitPathname('/chat/sync/events?after=1'), '/chat/sync/events');
  assert.equal(rateLimitPathname('/x#frag'), '/x');

  const skips = prod.skipPathPrefixes;
  assert.equal(shouldSkipApiRateLimit('/chat/sync/events', skips), true);
  assert.equal(shouldSkipApiRateLimit('/chat/unread-objects', skips), true);
  assert.equal(shouldSkipApiRateLimit('/auth/refresh', skips), true);
  assert.equal(shouldSkipApiRateLimit('/logs/stream', skips), true);

  // Must NOT skip unprotected / high-risk lookalikes
  assert.equal(shouldSkipApiRateLimit('/chat/messages/missed', skips), false);
  assert.equal(shouldSkipApiRateLimit('/chat/unread-totals', skips), false);
  assert.equal(shouldSkipApiRateLimit('/chat/unread-count', skips), false);
  assert.equal(shouldSkipApiRateLimit('/games/available', skips), false);
  assert.equal(shouldSkipApiRateLimit('/auth/login', skips), false);

  // Query / embedded substring must not skip unrelated routes
  assert.equal(shouldSkipApiRateLimit('/games/available?x=/chat/sync/', skips), false);
  assert.equal(shouldSkipApiRateLimit('/users/me?redirect=/chat/unread-objects', skips), false);
  assert.equal(shouldSkipApiRateLimit('/evil/auth/refresh', skips), false);
  assert.equal(shouldSkipApiRateLimit('/prefix/logs/stream', skips), false);

  console.log('apiRateLimit.test.ts: ok');
}

run();
