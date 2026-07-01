import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import prisma from '../../src/config/database';
import { UnreadCountQuery } from '../../src/services/chat/unreadCountQuery';
import { UnreadObjectsService } from '../../src/services/chat/unreadObjects.service';
import { buildByContextFromUnreadObjects } from '../../src/services/chat/unreadSnapshot.service';

const P95_TARGET_MS = 500;

async function findUserWithGames(): Promise<string | null> {
  const row = await prisma.gameParticipant.findFirst({
    where: { game: { status: { not: 'ARCHIVED' } } },
    select: { userId: true },
  });
  return row?.userId ?? null;
}

async function testSlimSnapshotShape(): Promise<void> {
  const userId = await findUserWithGames();
  if (!userId) {
    console.log('unread-count-query: skip slim shape (no game participants in DB)');
    return;
  }

  const slim = await UnreadCountQuery.getSnapshot(userId, 'counts');
  assert.ok(Array.isArray(slim.games) && slim.games.length === 0, 'slim games empty');
  assert.ok(Array.isArray(slim.userChats) && slim.userChats.length === 0, 'slim userChats empty');
  assert.ok(slim.byContext != null, 'slim has byContext');
  assert.ok(slim.totals != null, 'slim has totals');
  assert.ok(slim.clock?.userUnreadRevision != null, 'slim has clock');
  assert.ok(slim.groupChannelMeta != null, 'slim has groupChannelMeta');
}

async function testTotalsEndpointShape(): Promise<void> {
  const userId = await findUserWithGames();
  if (!userId) {
    console.log('unread-count-query: skip totals (no game participants in DB)');
    return;
  }

  const totals = await UnreadCountQuery.getTotals(userId);
  assert.equal(typeof totals.total, 'number');
  assert.equal(typeof totals.userUnreadRevision, 'number');
  assert.ok(totals.total >= 0);
}

async function testCountsParityWithObjects(): Promise<void> {
  const userId = await findUserWithGames();
  if (!userId) {
    console.log('unread-count-query: skip parity (no game participants in DB)');
    return;
  }

  const [slim, objects] = await Promise.all([
    UnreadCountQuery.getSnapshot(userId, 'counts'),
    UnreadObjectsService.getUnreadObjects(userId),
  ]);

  const objectsByContext = buildByContextFromUnreadObjects(objects);
  assert.deepEqual(slim.byContext, objectsByContext, 'slim byContext matches objects path');
}

async function testSlimSnapshotLatency(): Promise<void> {
  const userId = await findUserWithGames();
  if (!userId) {
    console.log('unread-count-query: skip latency (no game participants in DB)');
    return;
  }

  const samples: number[] = [];
  for (let i = 0; i < 5; i += 1) {
    const start = performance.now();
    await UnreadCountQuery.getSnapshot(userId, 'counts');
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const p95Index = Math.min(samples.length - 1, Math.ceil(samples.length * 0.95) - 1);
  const p95 = samples[p95Index] ?? samples[samples.length - 1] ?? 0;
  console.log(`unread-count-query: slim snapshot P95 sample=${p95.toFixed(1)}ms (target < ${P95_TARGET_MS}ms, n=${samples.length})`);
  assert.ok(p95 < P95_TARGET_MS * 4, `slim snapshot too slow: ${p95.toFixed(1)}ms`);
}

async function main(): Promise<void> {
  await testSlimSnapshotShape();
  await testTotalsEndpointShape();
  await testCountsParityWithObjects();
  await testSlimSnapshotLatency();
  console.log('unread-count-query.ts: ok');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
