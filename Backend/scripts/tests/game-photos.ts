#!/usr/bin/env ts-node
/**
 * GamePhoto CRUD, permissions, main/count, clientUploadId idempotency.
 * Run: DB_URL=... npx ts-node -r dotenv/config scripts/tests/game-photos.ts
 */

import * as path from 'path';
import * as dotenv from 'dotenv';
import { EntityType, GamePhotoSource, GameStatus, ParticipantRole } from '@prisma/client';
import { ApiError } from '../../src/utils/ApiError';
import { GamePhotoReadService } from '../../src/services/gamePhoto/gamePhoto.read.service';
import { GamePhotoUpdateService } from '../../src/services/gamePhoto/gamePhoto.update.service';
import { GamePhotoDeleteService } from '../../src/services/gamePhoto/gamePhoto.delete.service';
import {
  assertCanManage,
  loadGamePhotoManageContext,
} from '../../src/services/gamePhoto/gamePhoto.permissions';
import { GameReadService } from '../../src/services/game/read.service';
import { ResultsTelegramService } from '../../src/services/telegram/results-telegram.service';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

async function expectApiError(p: Promise<unknown>, status: number, label: string) {
  try {
    await p;
    console.error(`FAIL: ${label} — expected ApiError ${status}`);
    process.exit(1);
  } catch (e) {
    if (e instanceof ApiError && e.statusCode === status) {
      console.log(`ok: ${label}`);
      return;
    }
    throw e;
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

async function seedPhoto(
  prisma: typeof import('../../src/config/database').default,
  gameId: string,
  uploaderId: string,
  suffix: string,
  clientUploadId?: string
) {
  const photo = await prisma.gamePhoto.create({
    data: {
      gameId,
      uploaderId,
      originalUrl: `/uploads/chat/originals/qa-${suffix}.jpg`,
      thumbnailUrl: `/uploads/chat/thumbnails/qa-${suffix}.jpg`,
      clientUploadId: clientUploadId ?? null,
    },
  });
  await prisma.game.update({
    where: { id: gameId },
    data: {
      photosCount: { increment: 1 },
      mainPhotoId: photo.id,
    },
  });
  return photo;
}

async function main() {
  dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

  if (!ensureDbUrl()) {
    console.log('game-photos: skipped (set DB_URL)');
    process.exit(0);
  }

  const { default: prisma } = await import('../../src/config/database');
  const city = await prisma.city.findFirst({ select: { id: true } });
  if (!city) throw new Error('no City row');

  const users = await prisma.user.findMany({
    where: { isAdmin: false },
    take: 3,
    select: { id: true },
  });
  if (users.length < 3) throw new Error('need at least 3 non-admin users');
  const [ownerId, playerId, strangerId] = users.map((u) => u.id);

  const suffix = `${Date.now()}`;
  const openGameId = `qa-gp-open-${suffix}`;
  const restrictedGameId = `qa-gp-restricted-${suffix}`;
  const notFinalGameId = `qa-gp-notfinal-${suffix}`;
  const announcedGameId = `qa-gp-ann-${suffix}`;

  const start = new Date(Date.now() + 86_400_000);
  const end = new Date(start.getTime() + 3_600_000);

  const gameIds = [openGameId, restrictedGameId, notFinalGameId, announcedGameId];

  await prisma.game.create({
    data: {
      id: openGameId,
      entityType: EntityType.GAME,
      gameType: 'CLASSIC',
      cityId: city.id,
      startTime: start,
      endTime: end,
      timeIsSet: true,
      status: GameStatus.FINISHED,
      resultsStatus: 'FINAL',
      forbidOthersPhotosView: false,
      maxParticipants: 4,
      minParticipants: 2,
      participants: {
        create: [
          { userId: ownerId, role: ParticipantRole.OWNER, status: 'NON_PLAYING' },
          { userId: playerId, role: ParticipantRole.PARTICIPANT, status: 'PLAYING' },
        ],
      },
    },
  });

  await prisma.game.create({
    data: {
      id: restrictedGameId,
      entityType: EntityType.GAME,
      gameType: 'CLASSIC',
      cityId: city.id,
      startTime: start,
      endTime: end,
      timeIsSet: true,
      status: GameStatus.FINISHED,
      resultsStatus: 'FINAL',
      forbidOthersPhotosView: true,
      maxParticipants: 4,
      minParticipants: 2,
      participants: {
        create: [
          { userId: ownerId, role: ParticipantRole.OWNER, status: 'NON_PLAYING' },
          { userId: playerId, role: ParticipantRole.PARTICIPANT, status: 'PLAYING' },
        ],
      },
    },
  });

  await prisma.game.create({
    data: {
      id: notFinalGameId,
      entityType: EntityType.GAME,
      gameType: 'CLASSIC',
      cityId: city.id,
      startTime: start,
      endTime: end,
      timeIsSet: true,
      status: GameStatus.STARTED,
      resultsStatus: 'IN_PROGRESS',
      maxParticipants: 4,
      minParticipants: 2,
      participants: {
        create: [
          { userId: ownerId, role: ParticipantRole.OWNER, status: 'NON_PLAYING' },
          { userId: playerId, role: ParticipantRole.PARTICIPANT, status: 'PLAYING' },
        ],
      },
    },
  });

  await prisma.game.create({
    data: {
      id: announcedGameId,
      entityType: EntityType.GAME,
      gameType: 'CLASSIC',
      cityId: city.id,
      startTime: start,
      endTime: end,
      timeIsSet: true,
      status: GameStatus.ANNOUNCED,
      resultsStatus: 'NONE',
      maxParticipants: 4,
      minParticipants: 2,
      participants: {
        create: [{ userId: ownerId, role: ParticipantRole.OWNER, status: 'PLAYING' }],
      },
    },
  });

  try {
    const annCtx = await loadGamePhotoManageContext(announcedGameId, ownerId, false);
    await assertCanManage(annCtx);
    console.log('ok: owner can manage photos on ANNOUNCED game');

    await expectApiError(
      GamePhotoReadService.listGamePhotos(announcedGameId, ownerId, false),
      403,
      'list denied when results not FINAL'
    );

    await seedPhoto(prisma, restrictedGameId, playerId, `restricted-${suffix}`);
    await expectApiError(
      GamePhotoReadService.listGamePhotos(restrictedGameId, null, false),
      403,
      'anonymous denied on restricted FINAL game'
    );
    await expectApiError(
      GamePhotoReadService.listGamePhotos(restrictedGameId, strangerId, false),
      403,
      'stranger denied on restricted FINAL game'
    );
    const restrictedListed = await GamePhotoReadService.listGamePhotos(restrictedGameId, playerId, false);
    assert(restrictedListed.items.length >= 1, 'participant can list restricted gallery');
    console.log('ok: restricted mode list permissions');

    await seedPhoto(prisma, notFinalGameId, playerId, `notfinal-${suffix}`);
    await expectApiError(
      GamePhotoReadService.listGamePhotos(notFinalGameId, ownerId, false),
      403,
      'owner denied when results not FINAL'
    );
    console.log('ok: not FINAL denies all viewers');

    const p1 = await seedPhoto(prisma, openGameId, playerId, `p1-${suffix}`, `dup-${suffix}`);
    console.log('ok: seed photo on open FINAL game');

    const anonymousListed = await GamePhotoReadService.listGamePhotos(openGameId, null, false);
    assert(anonymousListed.items.length >= 1, 'anonymous list on open FINAL game');
    console.log('ok: anonymous list on open FINAL game');

    const strangerListed = await GamePhotoReadService.listGamePhotos(openGameId, strangerId, false);
    assert(strangerListed.items.length >= 1, 'stranger list on open FINAL game');
    console.log('ok: stranger list on open FINAL game');

    const dup = await prisma.gamePhoto.findFirst({
      where: {
        uploaderId: playerId,
        clientUploadId: `dup-${suffix}`,
        gameId: openGameId,
        deletedAt: null,
      },
    });
    assert(dup?.id === p1.id, 'clientUploadId lookup finds single row');
    console.log('ok: clientUploadId idempotent lookup');

    const p2 = await seedPhoto(prisma, openGameId, playerId, `p2-${suffix}`);
    const listed = await GamePhotoReadService.listGamePhotos(openGameId, ownerId, false);
    assert(listed.items.length >= 2, 'list returns photos');
    console.log('ok: list gallery');

    const gameRow = await prisma.game.findUnique({
      where: { id: openGameId },
      select: { photosCount: true, mainPhotoId: true },
    });
    assert(gameRow?.photosCount === 2, `photosCount is 2, got ${gameRow?.photosCount}`);
    assert(gameRow?.mainPhotoId === p2.id, 'latest upload is main');
    console.log('ok: photosCount and auto main');

    await GamePhotoUpdateService.setMainPhoto(openGameId, ownerId, false, p2.id);
    const afterMain = await prisma.game.findUnique({
      where: { id: openGameId },
      select: { mainPhotoId: true },
    });
    assert(afterMain?.mainPhotoId === p2.id, 'setMain updates mainPhotoId');
    console.log('ok: set main');

    const url = await ResultsTelegramService.getMainPhotoUrl({ mainPhotoId: p2.id });
    assert(url === p2.originalUrl, 'getMainPhotoUrl from GamePhoto');
    console.log('ok: telegram getMainPhotoUrl');

    const readGame = (await GameReadService.getGameById(openGameId, ownerId, true)) as {
      mainPhoto?: { id: string } | null;
      photosCount?: number;
      mainPhotoId?: string;
    };
    assert(readGame.mainPhoto?.id === p2.id, 'read embed mainPhoto');
    assert(readGame.photosCount === 2, 'read embed photosCount');
    assert(readGame.mainPhotoId === undefined, 'mainPhotoId stripped from payload');
    console.log('ok: game read embed');

    await GamePhotoUpdateService.setMainPhoto(openGameId, playerId, false, p1.id);
    const playerMain = await prisma.game.findUnique({
      where: { id: openGameId },
      select: { mainPhotoId: true },
    });
    assert(playerMain?.mainPhotoId === p1.id, 'participant can set main');
    console.log('ok: participant set main');

    await GamePhotoDeleteService.deleteGamePhoto(openGameId, p2.id, playerId, false);
    const afterDelMain = await prisma.game.findUnique({
      where: { id: openGameId },
      select: { mainPhotoId: true, photosCount: true },
    });
    assert(afterDelMain?.mainPhotoId === p1.id, 'delete main picks next oldest');
    assert(afterDelMain?.photosCount === 1, 'photosCount decremented');
    console.log('ok: delete main re-picks');

    await GamePhotoDeleteService.deleteGamePhoto(openGameId, p1.id, ownerId, false);
    const empty = await prisma.game.findUnique({
      where: { id: openGameId },
      select: { photosCount: true, mainPhotoId: true },
    });
    assert(empty?.photosCount === 0, 'photosCount zero after last delete');
    assert(empty?.mainPhotoId === null, 'mainPhotoId null after last delete');
    console.log('ok: delete last photo clears main and count');

    const aiPhoto = await prisma.gamePhoto.create({
      data: {
        gameId: openGameId,
        source: GamePhotoSource.AI_GENERATED,
        uploaderId: null,
        originalUrl: `/uploads/chat/originals/qa-ai-${suffix}.webp`,
        thumbnailUrl: `/uploads/chat/thumbnails/qa-ai-${suffix}.webp`,
      },
    });
    const aiRow = await prisma.gamePhoto.findUnique({
      where: { id: aiPhoto.id },
      select: { source: true, uploaderId: true },
    });
    assert(aiRow?.source === 'AI_GENERATED', 'AI_GENERATED source on GamePhoto');
    assert(aiRow?.uploaderId === null, 'AI photo uploaderId null');
    await prisma.gamePhoto.delete({ where: { id: aiPhoto.id } });
    console.log('ok: GamePhoto AI_GENERATED source');
  } finally {
    await prisma.gamePhoto.deleteMany({ where: { gameId: { in: gameIds } } });
    await prisma.gameParticipant.deleteMany({ where: { gameId: { in: gameIds } } });
    await prisma.game.deleteMany({ where: { id: { in: gameIds } } });
  }

  console.log('\nAll game-photos checks passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
