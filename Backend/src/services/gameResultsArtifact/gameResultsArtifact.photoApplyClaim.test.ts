import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { EntityType, GameStatus, ParticipantRole } from '@prisma/client';

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });

function ensureDbUrl(): boolean {
  let url = process.env.DB_URL;
  if (!url) return false;
  if (!/[?&]schema=/.test(url)) {
    url += (url.includes('?') ? '&' : '?') + 'schema=padelpulse';
    process.env.DB_URL = url;
  }
  return true;
}

async function runDbTest() {
  const { default: prisma } = await import('../../config/database');
  const {
    tryClaimArtifactPhotoApply,
    isArtifactPhotoApplyClaimable,
  } = await import('./gameResultsArtifact.photoApplyClaim');

  const city = await prisma.city.findFirst({ select: { id: true } });
  if (!city) throw new Error('no City row');

  const user = await prisma.user.findFirst({
    where: { isAdmin: false },
    select: { id: true },
  });
  if (!user) throw new Error('need a user');

  const gameId = `qa-gra-claim-${Date.now()}`;
  const start = new Date(Date.now() + 86_400_000);
  const end = new Date(start.getTime() + 3_600_000);

  await prisma.game.create({
    data: {
      id: gameId,
      entityType: EntityType.GAME,
      gameType: 'CLASSIC',
      cityId: city.id,
      startTime: start,
      endTime: end,
      timeIsSet: true,
      status: GameStatus.FINISHED,
      resultsStatus: 'FINAL',
      finishedDate: new Date(),
      participants: {
        create: [{ userId: user.id, role: ParticipantRole.OWNER, status: 'PLAYING' }],
      },
      resultsArtifactJob: {
        create: {
          languageCode: 'en',
          status: 'running',
          photoStatus: 'running',
          summaryStatus: 'done',
          replicatePredictionId: 'pred-claim-test',
        },
      },
    },
  });

  const job = await prisma.gameResultsArtifactJob.findUnique({ where: { gameId } });
  assert.ok(job);

  try {
    const [first, second, third] = await Promise.all([
      tryClaimArtifactPhotoApply(job!.id),
      tryClaimArtifactPhotoApply(job!.id),
      tryClaimArtifactPhotoApply(job!.id),
    ]);

    assert.equal(first, true, 'first concurrent claim wins');
    assert.equal(second, false, 'second concurrent claim loses');
    assert.equal(third, false, 'third concurrent claim loses');

    const after = await prisma.gameResultsArtifactJob.findUnique({
      where: { id: job!.id },
      select: { photoStatus: true, photoGenerationsUsed: true },
    });
    assert.equal(after?.photoStatus, 'done');
    assert.equal(after?.photoGenerationsUsed, 1);
    assert.equal(await isArtifactPhotoApplyClaimable(job!.id), false);

    console.log('gameResultsArtifact.photoApplyClaim.test.ts: db ok');
  } finally {
    await prisma.gameResultsArtifactJob.deleteMany({ where: { gameId } });
    await prisma.gameParticipant.deleteMany({ where: { gameId } });
    await prisma.game.deleteMany({ where: { id: gameId } });
  }
}

async function main() {
  if (!ensureDbUrl()) {
    console.log('gameResultsArtifact.photoApplyClaim.test.ts: skipped (set DB_URL)');
    return;
  }
  await runDbTest();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
