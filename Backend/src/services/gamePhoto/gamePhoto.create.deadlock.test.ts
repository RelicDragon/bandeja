import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { EntityType, GameStatus, ParticipantRole, Prisma } from '@prisma/client';

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

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

async function runDbTest() {
  const { default: prisma } = await import('../../config/database');
  const { GamePhotoCreateService } = await import('./gamePhoto.create.service');

  const city = await prisma.city.findFirst({ select: { id: true } });
  if (!city) throw new Error('no City row');

  const user = await prisma.user.findFirst({
    where: { isAdmin: false },
    select: { id: true },
  });
  if (!user) throw new Error('need a user');

  const gameId = `qa-photo-deadlock-${Date.now()}`;
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
    },
  });

  try {
    const rounds = 12;
    for (let round = 0; round < rounds; round++) {
      await Promise.all([
        GamePhotoCreateService.createFromGeneratedBuffer(gameId, PNG, 'ai-' + round + '.png'),
        prisma.$transaction(async (tx) => {
          await tx.$executeRaw(Prisma.sql`SELECT id FROM "Game" WHERE id = ${gameId} FOR UPDATE`);
          await tx.game.update({
            where: { id: gameId },
            data: { resultsArtifactsVersion: { increment: 1 } },
          });
        }),
      ]);
    }

    const count = await prisma.gamePhoto.count({
      where: { gameId, deletedAt: null, source: 'AI_GENERATED' },
    });
    assert.equal(count, rounds, 'all AI photos saved without deadlock');

    console.log('gamePhoto.create.deadlock.test.ts: db ok');
  } finally {
    await prisma.gamePhoto.deleteMany({ where: { gameId } });
    await prisma.gameParticipant.deleteMany({ where: { gameId } });
    await prisma.game.deleteMany({ where: { id: gameId } });
  }
}

async function main() {
  if (!ensureDbUrl()) {
    console.log('gamePhoto.create.deadlock.test.ts: skipped (set DB_URL)');
    return;
  }
  await runDbTest();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
