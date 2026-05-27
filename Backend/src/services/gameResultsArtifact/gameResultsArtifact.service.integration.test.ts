import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { EntityType, GameStatus, ParticipantRole } from '@prisma/client';
import { buildResultsArtifactsDto } from './gameResultsArtifact.dto';
import { isGameResultStoryEligible } from './gameResultsArtifactStory.eligibility';
import { shouldSkipArtifactReenqueue } from './gameResultsArtifact.enqueuePolicy';

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });
process.env.RESULTS_ARTIFACTS_ENABLED = 'true';

function ensureDbUrl(): boolean {
  let url = process.env.DB_URL;
  if (!url) return false;
  if (!/[?&]schema=/.test(url)) {
    url += (url.includes('?') ? '&' : '?') + 'schema=padelpulse';
    process.env.DB_URL = url;
  }
  return true;
}

async function runDbIntegration() {
  const { default: prisma } = await import('../../config/database');
  const {
    GameResultsArtifactService,
    setGameResultsArtifactTestDeps,
  } = await import('./gameResultsArtifact.service');
  const { GameResultsArtifactQueueService } = await import(
    './gameResultsArtifactQueue.service'
  );

  const city = await prisma.city.findFirst({ select: { id: true } });
  if (!city) throw new Error('no City row');

  const user = await prisma.user.findFirst({
    where: { isAdmin: false },
    select: { id: true },
  });
  if (!user) throw new Error('need a user');

  const suffix = `${Date.now()}`;
  const gameId = `qa-gra-${suffix}`;
  const sentGameId = `qa-gra-sent-${suffix}`;

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
        create: [
          { userId: user.id, role: ParticipantRole.OWNER, status: 'PLAYING' },
        ],
      },
    },
  });

  await prisma.game.create({
    data: {
      id: sentGameId,
      entityType: EntityType.GAME,
      gameType: 'CLASSIC',
      cityId: city.id,
      startTime: start,
      endTime: end,
      timeIsSet: true,
      status: GameStatus.FINISHED,
      resultsStatus: 'FINAL',
      resultsSentToTelegram: true,
      finishedDate: new Date(),
      participants: {
        create: [
          { userId: user.id, role: ParticipantRole.OWNER, status: 'PLAYING' },
        ],
      },
    },
  });

  try {
    const beforeDto = buildResultsArtifactsDto({
      resultsArtifactsVersion: 0,
      resultsArtifactsReadyAt: null,
      resultsArtifactJob: null,
    });
    assert.equal(beforeDto.status, 'none');
    assert.equal(beforeDto.readyAt, null);
    assert.equal(
      isGameResultStoryEligible({
        resultsStatus: 'FINAL',
        resultsArtifactsReadyAt: null,
      }),
      false
    );

    setGameResultsArtifactTestDeps({
      summaryGenerate: async () => 'QA artifacts summary',
    });

    await GameResultsArtifactQueueService.enqueueStep(gameId, 'summary');

    const job = await prisma.gameResultsArtifactJob.findUnique({
      where: { gameId },
    });
    assert.ok(job, 'job enqueued');

    if (job.status !== 'running') {
      await prisma.gameResultsArtifactJob.update({
        where: { id: job.id },
        data: { status: 'running' },
      });
    }

    await GameResultsArtifactService.runJob(job.id);

    const after = await prisma.game.findUnique({
      where: { id: gameId },
      select: {
        resultsSummaryText: true,
        resultsArtifactsReadyAt: true,
        resultsArtifactsVersion: true,
        resultsArtifactJob: {
          select: { status: true, summaryStatus: true, photoStatus: true },
        },
      },
    });

    assert.equal(after?.resultsSummaryText, 'QA artifacts summary');
    assert.ok(after?.resultsArtifactsReadyAt, 'readyAt set');
    assert.equal(after?.resultsArtifactJob?.status, 'done');
    assert.equal(after?.resultsArtifactJob?.summaryStatus, 'done');
    assert.equal(after?.resultsArtifactJob?.photoStatus, 'skipped');

    const afterDto = buildResultsArtifactsDto({
      resultsArtifactsVersion: after!.resultsArtifactsVersion,
      resultsArtifactsReadyAt: after!.resultsArtifactsReadyAt,
      resultsArtifactJob: after!.resultsArtifactJob,
    });
    assert.equal(afterDto.status, 'done');
    assert.ok(afterDto.readyAt);
    assert.equal(afterDto.summaryReady, true);
    assert.equal(afterDto.photoReady, true);

    assert.equal(
      isGameResultStoryEligible({
        resultsStatus: 'FINAL',
        resultsArtifactsReadyAt: after!.resultsArtifactsReadyAt,
      }),
      true
    );

    const sentVersionBefore = (
      await prisma.game.findUnique({
        where: { id: sentGameId },
        select: { resultsArtifactsVersion: true },
      })
    )?.resultsArtifactsVersion;

    await GameResultsArtifactQueueService.enqueueStep(sentGameId, 'summary');

    const sentAfter = await prisma.game.findUnique({
      where: { id: sentGameId },
      select: { resultsArtifactsVersion: true, resultsArtifactJob: true },
    });
    assert.equal(sentAfter?.resultsArtifactsVersion, sentVersionBefore);
    assert.equal(sentAfter?.resultsArtifactJob, null);
    assert.equal(
      shouldSkipArtifactReenqueue({ resultsSentToTelegram: true }),
      true
    );

    console.log('gameResultsArtifact.service.integration.test.ts: db ok');
  } finally {
    setGameResultsArtifactTestDeps(null);
    await prisma.gameResultsArtifactJob.deleteMany({
      where: { gameId: { in: [gameId, sentGameId] } },
    });
    await prisma.gameParticipant.deleteMany({
      where: { gameId: { in: [gameId, sentGameId] } },
    });
    await prisma.game.deleteMany({
      where: { id: { in: [gameId, sentGameId] } },
    });
  }
}

async function main() {
  if (!ensureDbUrl()) {
    console.log(
      'gameResultsArtifact.service.integration.test.ts: skipped (set DB_URL)'
    );
    return;
  }
  await runDbIntegration();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
