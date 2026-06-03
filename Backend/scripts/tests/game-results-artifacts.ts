#!/usr/bin/env ts-node
/**
 * Finalize → artifact job → DTO readyAt → story eligibility gate.
 * Run: RESULTS_ARTIFACTS_ENABLED=true DB_URL=... npx ts-node -r dotenv/config scripts/tests/game-results-artifacts.ts
 */

import * as path from 'path';
import * as dotenv from 'dotenv';
import { EntityType, GamePhotoSource, GameStatus, ParticipantRole } from '@prisma/client';
import { buildResultsArtifactsDto } from '../../src/services/gameResultsArtifact/gameResultsArtifact.dto';
import { isGameResultStoryEligible } from '../../src/services/gameResultsArtifact/gameResultsArtifactStory.eligibility';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function ensureDbUrl() {
  let url = process.env.DB_URL;
  if (!url) return false;
  if (!/[?&]schema=/.test(url)) {
    url += (url.includes('?') ? '&' : '?') + 'schema=padelpulse';
    process.env.DB_URL = url;
  }
  return true;
}

async function main() {
  dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
  process.env.RESULTS_ARTIFACTS_ENABLED = 'true';

  const {
    GameResultsArtifactService,
    setGameResultsArtifactTestDeps,
  } = await import('../../src/services/gameResultsArtifact/gameResultsArtifact.service');
  const { GameResultsArtifactQueueService } = await import(
    '../../src/services/gameResultsArtifact/gameResultsArtifactQueue.service'
  );

  if (!ensureDbUrl()) {
    console.log('game-results-artifacts: skipped (set DB_URL)');
    process.exit(0);
  }

  const { default: prisma } = await import('../../src/config/database');

  const city = await prisma.city.findFirst({ select: { id: true } });
  if (!city) throw new Error('no City row');

  const user = await prisma.user.findFirst({
    where: { isAdmin: false },
    select: { id: true },
  });
  if (!user) throw new Error('need a user');

  const suffix = `${Date.now()}`;
  const gameId = `qa-gra-script-${suffix}`;

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

  try {
    assert(
      !isGameResultStoryEligible({
        resultsStatus: 'FINAL',
        resultsArtifactsReadyAt: null,
      }),
      'story excluded before pipeline ready'
    );

    setGameResultsArtifactTestDeps({
      summaryGenerate: async () => 'Script QA summary',
    });

    await GameResultsArtifactQueueService.enqueueStep(gameId, 'summary');
    const job = await prisma.gameResultsArtifactJob.findUnique({
      where: { gameId },
    });
    assert(!!job, 'job exists after finalize enqueue');

    if (job!.status !== 'running') {
      await prisma.gameResultsArtifactJob.update({
        where: { id: job!.id },
        data: { status: 'running' },
      });
    }
    await GameResultsArtifactService.runJob(job!.id);

    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: {
        resultsArtifactsReadyAt: true,
        resultsArtifactsVersion: true,
        resultsSummaryText: true,
        resultsArtifactJob: {
          select: { status: true, summaryStatus: true, photoStatus: true },
        },
      },
    });

    const dto = buildResultsArtifactsDto({
      resultsArtifactsVersion: game!.resultsArtifactsVersion,
      resultsArtifactsReadyAt: game!.resultsArtifactsReadyAt,
      resultsArtifactJob: game!.resultsArtifactJob,
    });
    assert(dto.status === 'done', 'DTO status done');
    assert(dto.readyAt != null, 'DTO readyAt set');
    assert(
      isGameResultStoryEligible({
        resultsStatus: 'FINAL',
        resultsArtifactsReadyAt: game!.resultsArtifactsReadyAt,
      }),
      'story eligible after ready'
    );
    console.log('ok: finalize → job → DTO → story gate');

    const aiPhoto = await prisma.gamePhoto.create({
      data: {
        gameId,
        source: GamePhotoSource.AI_GENERATED,
        uploaderId: null,
        originalUrl: `/uploads/chat/originals/qa-ai-${suffix}.webp`,
        thumbnailUrl: `/uploads/chat/thumbnails/qa-ai-${suffix}.webp`,
      },
    });
    await prisma.game.update({
      where: { id: gameId },
      data: { photosCount: 1 },
    });

    const aiRow = await prisma.gamePhoto.findUnique({
      where: { id: aiPhoto.id },
      select: { source: true, uploaderId: true },
    });
    assert(aiRow?.source === 'AI_GENERATED', 'AI_GENERATED source persisted');
    assert(aiRow?.uploaderId === null, 'AI photo has no uploader');
    console.log('ok: GamePhoto AI_GENERATED source');

    await prisma.gamePhoto.deleteMany({ where: { gameId } });
    await prisma.game.update({
      where: { id: gameId },
      data: { photosCount: 0, mainPhotoId: null },
    });

    const userPhoto = await prisma.gamePhoto.create({
      data: {
        gameId,
        uploaderId: ownerId,
        originalUrl: `/uploads/chat/originals/qa-user-${suffix}.jpg`,
        thumbnailUrl: `/uploads/chat/thumbnails/qa-user-${suffix}.jpg`,
      },
    });
    await prisma.game.update({
      where: { id: gameId },
      data: { photosCount: 1, mainPhotoId: userPhoto.id },
    });

    const { GamePhotoCreateService } = await import('../../src/services/gamePhoto/gamePhoto.create.service');
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
    const aiDto = await GamePhotoCreateService.createFromGeneratedBuffer(gameId, png, 'ai-test.png');
    const afterAiMain = await prisma.game.findUnique({
      where: { id: gameId },
      select: { mainPhotoId: true, photosCount: true },
    });
    assert(afterAiMain?.mainPhotoId === aiDto.id, 'AI photo becomes main');
    assert(afterAiMain?.photosCount === 2, 'photosCount includes AI photo');
    console.log('ok: AI photo sets mainPhotoId');
  } finally {
    setGameResultsArtifactTestDeps(null);
    await prisma.gamePhoto.deleteMany({ where: { gameId } });
    await prisma.gameResultsArtifactJob.deleteMany({ where: { gameId } });
    await prisma.gameParticipant.deleteMany({ where: { gameId } });
    await prisma.game.delete({ where: { id: gameId } });
  }

  console.log('\nAll game-results-artifacts checks passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
