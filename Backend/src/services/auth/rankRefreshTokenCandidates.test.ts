import assert from 'node:assert/strict';
import { hashRefreshToken } from '../../utils/refreshTokenCrypto';
import { rankRefreshTokenCandidates } from './userRefreshSession.service';

const now = new Date('2026-08-18T00:00:00.000Z');
const future = new Date('2026-10-17T00:00:00.000Z');
const past = new Date('2026-08-09T10:21:02.000Z');

function row(partial: {
  revokedAt?: Date | null;
  lastUsedAt: Date;
  replacedBySessionId?: string | null;
  replacementTokenCiphertext?: string | null;
}) {
  return {
    revokedAt: partial.revokedAt ?? null,
    expiresAt: future,
    lastUsedAt: partial.lastUsedAt,
    replacedBySessionId: partial.replacedBySessionId ?? null,
    replacementTokenCiphertext: partial.replacementTokenCiphertext ?? null,
  };
}

const dead = 'host-only-dead';
const live = 'domain-live';
const olderLive = 'older-live';

const dual = new Map([
  [
    hashRefreshToken(dead),
    row({
      revokedAt: past,
      lastUsedAt: past,
      replacedBySessionId: 'successor',
      replacementTokenCiphertext: null,
    }),
  ],
  [hashRefreshToken(live), row({ lastUsedAt: now })],
]);

assert.deepEqual(
  rankRefreshTokenCandidates([dead, live], dual, now),
  [live, dead],
  'live Domain cookie must win over a dead host-only duplicate',
);

const twoLive = new Map([
  [hashRefreshToken(olderLive), row({ lastUsedAt: past })],
  [hashRefreshToken(live), row({ lastUsedAt: now })],
]);
assert.deepEqual(
  rankRefreshTokenCandidates([olderLive, live], twoLive, now),
  [live, olderLive],
  'newest live session wins when both cookies are still valid',
);

console.log('rankRefreshTokenCandidates.test.ts: ok');
