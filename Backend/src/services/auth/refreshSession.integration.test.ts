import assert from 'node:assert/strict';
import type { Request } from 'express';
import prisma from '../../config/database';
import { config } from '../../config/env';
import { ApiError } from '../../utils/ApiError';
import {
  createUserRefreshSession,
  refreshActiveSession,
  revokeByRawToken,
} from './userRefreshSession.service';

function request(platform: 'web' | 'ios' | 'android' = 'ios'): Request {
  return {
    headers: {
      'x-client-platform': platform,
      'x-client-version': '99.0.0',
      'user-agent': 'auth-refresh-integration-test',
    },
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as Request;
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
    assert.fail(`expected ${code}`);
  } catch (error) {
    assert.ok(error instanceof ApiError);
    assert.equal(error.data?.code, code);
  }
}

void (async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const city = await prisma.city.create({
    data: { name: `Auth refresh ${suffix}`, country: 'Test', timezone: 'UTC' },
  });
  const user = await prisma.user.create({
    data: {
      phone: `auth-refresh-${suffix}`,
      firstName: 'Refresh',
      currentCityId: city.id,
    },
  });
  const req = request();

  try {
    const initial = await createUserRefreshSession(user.id, req);
    const requestId = `refresh-request-${suffix}-a`;
    const rotated = await refreshActiveSession(initial.refreshToken, req, requestId);
    assert.notEqual(rotated.refreshToken, initial.refreshToken);
    assert.notEqual(rotated.currentSessionId, initial.sessionId);

    // Exact replay after a lost response returns the same successor, even after server state committed.
    const replayed = await refreshActiveSession(initial.refreshToken, req, requestId);
    assert.equal(replayed.refreshToken, rotated.refreshToken);
    assert.equal(replayed.currentSessionId, rotated.currentSessionId);

    // If the browser accepted Set-Cookie but JavaScript timed out, the successor arrives with
    // the old request id. It is completion of the same rotation and must not rotate again.
    const cookieAppliedBeforeTimeout = await refreshActiveSession(
      rotated.refreshToken,
      req,
      requestId
    );
    assert.equal(cookieAppliedBeforeTimeout.refreshToken, rotated.refreshToken);
    assert.equal(cookieAppliedBeforeTimeout.currentSessionId, rotated.currentSessionId);

    // Phone/Watch/tabs may retry the predecessor with a different request id while the
    // successor is still the live family tip. Replay that successor instead of logging out.
    const concurrentDevice = await refreshActiveSession(
      initial.refreshToken,
      req,
      `refresh-request-${suffix}-different`
    );
    assert.equal(concurrentDevice.refreshToken, rotated.refreshToken);
    assert.equal(concurrentDevice.currentSessionId, rotated.currentSessionId);

    // A duplicate that arrives after its successor advanced must never resurrect
    // that now-stale successor credential.
    const advanced = await refreshActiveSession(
      rotated.refreshToken,
      req,
      `refresh-request-${suffix}-advanced`
    );
    await expectCode(refreshActiveSession(initial.refreshToken, req, requestId), 'auth.refreshReused');

    // Identical concurrent requests converge on one durable successor.
    const concurrent = await createUserRefreshSession(user.id, req);
    const concurrentId = `refresh-request-${suffix}-concurrent`;
    const sameRequestResults = await Promise.all([
      refreshActiveSession(concurrent.refreshToken, req, concurrentId),
      refreshActiveSession(concurrent.refreshToken, req, concurrentId),
      refreshActiveSession(concurrent.refreshToken, req, concurrentId),
    ]);
    assert.equal(new Set(sameRequestResults.map((result) => result.refreshToken)).size, 1);
    assert.equal(new Set(sameRequestResults.map((result) => result.currentSessionId)).size, 1);

    // Different concurrent request IDs converge on the same live successor instead of
    // treating the loser as stolen-token reuse.
    const raced = await createUserRefreshSession(user.id, req);
    const raceResults = await Promise.all([
      refreshActiveSession(raced.refreshToken, req, `refresh-request-${suffix}-race-a`),
      refreshActiveSession(raced.refreshToken, req, `refresh-request-${suffix}-race-b`),
    ]);
    assert.equal(new Set(raceResults.map((result) => result.refreshToken)).size, 1);
    assert.equal(new Set(raceResults.map((result) => result.currentSessionId)).size, 1);
    assert.notEqual(raceResults[0].refreshToken, raced.refreshToken);

    // Explicit revocation wins over replay and cannot resurrect a session.
    await revokeByRawToken(advanced.refreshToken);
    await expectCode(
      refreshActiveSession(rotated.refreshToken, req, `refresh-request-${suffix}-advanced`),
      'auth.refreshInvalid'
    );

    // Pre-force-update clients without an idempotency header stay on the stable compatibility path.
    const legacy = await createUserRefreshSession(user.id, req);
    const legacyRefresh = await refreshActiveSession(legacy.refreshToken, req);
    assert.equal(legacyRefresh.refreshToken, legacy.refreshToken);
    assert.equal(legacyRefresh.currentSessionId, legacy.sessionId);

    // Session creation enforces a bounded active-device set instead of growing forever.
    for (let i = 0; i < config.authMaxActiveSessionsPerUser + 2; i += 1) {
      await createUserRefreshSession(user.id, req);
    }
    const activeCount = await prisma.userRefreshSession.count({
      where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    assert.equal(activeCount, config.authMaxActiveSessionsPerUser);

    console.log('refreshSession.integration.test.ts: ok');
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    await prisma.city.delete({ where: { id: city.id } }).catch(() => undefined);
    await prisma.$disconnect();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
