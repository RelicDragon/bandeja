import assert from 'node:assert/strict';
import { buildActiveRefreshSessionUpdate } from './userRefreshSession.service';

const now = new Date('2026-08-13T12:00:00.000Z');
const expiresAt = new Date('2026-10-12T12:00:00.000Z');

const update = buildActiveRefreshSessionUpdate({
  now,
  expiresAt,
  platform: 'ios',
  userAgent: 'Bandeja/0.97.27',
  ip: '203.0.113.7',
});

assert.deepEqual(update, {
  lastUsedAt: now,
  expiresAt,
  platform: 'ios',
  userAgent: 'Bandeja/0.97.27',
  ip: '203.0.113.7',
});
assert.equal('revokedAt' in update, false, 'replay/touch must only update the live session');
assert.equal(
  'replacedBySessionId' in update,
  false,
  'replay/touch must not create a rotation chain',
);

console.log('refresh session mutation tests passed');
