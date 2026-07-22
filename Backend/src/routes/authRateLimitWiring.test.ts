import assert from 'node:assert/strict';
import authRoutes from './auth.routes';

function layerNames(stack: unknown): string[] {
  if (!Array.isArray(stack)) return [];
  return stack.map((layer: { name?: string; handle?: { name?: string } }) => {
    return layer?.name || layer?.handle?.name || '';
  });
}

function routeStackFor(path: string, method: string): unknown[] {
  const stack = (authRoutes as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: unknown[] } }> }).stack;
  const layer = stack.find(
    (l) => l.route?.path === path && l.route.methods[method.toLowerCase()]
  );
  assert.ok(layer?.route, `missing route ${method} ${path}`);
  return layer!.route!.stack;
}

function assertHasRateLimit(path: string, method: string): void {
  const names = layerNames(routeStackFor(path, method));
  // express-rate-limit registers as anonymous or 'rateLimit'
  const hasLimiter = routeStackFor(path, method).length >= 2;
  assert.ok(hasLimiter, `${method} ${path} must have limiter before handler (layers=${names.join(',')})`);
}

function run() {
  assertHasRateLimit('/login/phone', 'post');
  assertHasRateLimit('/register/phone', 'post');
  assertHasRateLimit('/login/apple', 'post');
  assertHasRateLimit('/login/google', 'post');
  assertHasRateLimit('/google/exchange', 'post');
  assertHasRateLimit('/google/redirect', 'get');
  assertHasRateLimit('/google/callback', 'get');
  assertHasRateLimit('/refresh', 'post');

  console.log('authRateLimitWiring.test.ts: ok');
  process.exit(0);
}

run();
