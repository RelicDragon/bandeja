import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { EntityType, GameStatus, ParticipantRole } from '@prisma/client';

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

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
  const { GamePhotoCreateService } = await import('./gamePhoto.create.service');

  const city = await prisma.city.findFirst({ select: { id: true } });
  if (!city) throw new Error('no City row');

  const user = await prisma.user.findFirst({
    where: { isAdmin: false },
    select: { id: true },
  });
  if (!user) throw new Error('need a user');

  const gameId = `qa-photo-main-${Date.now()}`;
  const clientUploadId = `dup-main-${Date.now()}`;
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
      status: GameStatus.STARTED,
      maxParticipants: 4,
      minParticipants: 2,
      participants: {
        create: [{ userId: user.id, role: ParticipantRole.OWNER, status: 'PLAYING' }],
      },
    },
  });

  try {
    const first = await GamePhotoCreateService.uploadGamePhoto(
      gameId,
      user.id,
      false,
      { buffer: PNG, originalname: 'first.png', size: PNG.length },
      clientUploadId
    );

    let row = await prisma.game.findUnique({
      where: { id: gameId },
      select: { mainPhotoId: true, photosCount: true },
    });
    assert.equal(row?.mainPhotoId, first.id, 'first upload sets mainPhotoId');
    assert.equal(row?.photosCount, 1, 'photosCount incremented');

    await prisma.game.update({
      where: { id: gameId },
      data: { mainPhotoId: null },
    });

    const retry = await GamePhotoCreateService.uploadGamePhoto(
      gameId,
      user.id,
      false,
      { buffer: PNG, originalname: 'first.png', size: PNG.length },
      clientUploadId
    );
    assert.equal(retry.id, first.id, 'idempotent retry returns same photo');

    row = await prisma.game.findUnique({
      where: { id: gameId },
      select: { mainPhotoId: true, photosCount: true },
    });
    assert.equal(row?.mainPhotoId, first.id, 'idempotent retry repairs missing mainPhotoId');
    assert.equal(row?.photosCount, 1, 'photosCount unchanged on idempotent retry');

    const ai = await GamePhotoCreateService.createFromGeneratedBuffer(gameId, PNG, 'ai.png');
    row = await prisma.game.findUnique({
      where: { id: gameId },
      select: { mainPhotoId: true, photosCount: true },
    });
    assert.equal(row?.mainPhotoId, ai.id, 'AI upload becomes main');
    assert.equal(row?.photosCount, 2, 'photosCount includes AI photo');

    console.log('gamePhoto.create.mainPhoto.test.ts: db ok');
  } finally {
    await prisma.gamePhoto.deleteMany({ where: { gameId } });
    await prisma.gameParticipant.deleteMany({ where: { gameId } });
    await prisma.game.deleteMany({ where: { id: gameId } });
  }
}

async function main() {
  if (!ensureDbUrl()) {
    console.log('gamePhoto.create.mainPhoto.test.ts: skipped (set DB_URL)');
    return;
  }
  await runDbTest();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
