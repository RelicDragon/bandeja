import assert from 'assert';
import { isAllowedKlikterenUpstreamPath } from './klikterenUpstream.service';

assert.strictEqual(isAllowedKlikterenUpstreamPath('/api/venues'), true);
assert.strictEqual(isAllowedKlikterenUpstreamPath('/api/venues/abc'), true);
assert.strictEqual(isAllowedKlikterenUpstreamPath('/api/venues/abc/availability?date=2026-07-22'), true);
assert.strictEqual(isAllowedKlikterenUpstreamPath('/api/courts/abc'), true);
assert.strictEqual(isAllowedKlikterenUpstreamPath('/api/cities'), true);
assert.strictEqual(isAllowedKlikterenUpstreamPath('/api/auth/login'), true);
assert.strictEqual(isAllowedKlikterenUpstreamPath('/api/auth/session'), true);
assert.strictEqual(isAllowedKlikterenUpstreamPath('/api/auth/me'), true);
assert.strictEqual(isAllowedKlikterenUpstreamPath('/api/auth/signOut'), true);
assert.strictEqual(isAllowedKlikterenUpstreamPath('/api/bookings'), true);
assert.strictEqual(isAllowedKlikterenUpstreamPath('/api/bookings/create'), true);
assert.strictEqual(isAllowedKlikterenUpstreamPath('/api/bookings/cancel'), true);
assert.strictEqual(isAllowedKlikterenUpstreamPath('/api/admin'), false);
assert.strictEqual(isAllowedKlikterenUpstreamPath('/api/auth/reset'), false);
assert.strictEqual(isAllowedKlikterenUpstreamPath('/evil'), false);
assert.strictEqual(isAllowedKlikterenUpstreamPath('/api/venues/../auth/login'), false);
assert.strictEqual(isAllowedKlikterenUpstreamPath('/api/venues/abc/extra'), false);

console.log('klikterenUpstream.service.test.ts: all passed');
