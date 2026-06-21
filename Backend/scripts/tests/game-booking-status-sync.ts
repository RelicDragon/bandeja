import assert from 'node:assert/strict';
import { ClubIntegrationType } from '@prisma/client';
import prisma from '../../src/config/database';
import { GameCreateService } from '../../src/services/game/create.service';
import { GameUpdateService } from '../../src/services/game/update.service';
import {
  linkBookingToGame,
  patchGameBookings,
  putGameBookingSnapshots,
} from '../../src/services/game/gameExternalBooking.service';

async function getTestUser() {
  return prisma.user.findFirst({
    where: { isActive: true, currentCityId: { not: null } },
    select: { id: true, currentCityId: true, isAdmin: true },
  });
}

function baseCreatePayload(cityId: string, start: Date, end: Date) {
  return {
    gameType: 'CLASSIC',
    cityId,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    maxParticipants: 4,
  };
}

async function cleanupGame(gameId: string) {
  await prisma.gameExternalBooking.deleteMany({ where: { gameId } });
  await prisma.gameParticipant.deleteMany({ where: { gameId } });
  await prisma.game.delete({ where: { id: gameId } });
}

async function readStatus(gameId: string) {
  return prisma.game.findUnique({
    where: { id: gameId },
    select: { bookingStatus: true, hasBookedCourt: true, maxParticipants: true },
  });
}

async function main() {
  const user = await getTestUser();
  if (!user?.currentCityId) {
    console.log('skip: game-booking-status-sync (no active user with city)');
    return;
  }

  const start = new Date(Date.now() + 86_400_000);
  const end = new Date(start.getTime() + 7_200_000);
  const bookingA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const bookingB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  const manualGame = await GameCreateService.createGame(
    { ...baseCreatePayload(user.currentCityId, start, end), hasBookedCourt: true },
    user.id,
    false,
  );
  assert.ok(manualGame);
  assert.equal(manualGame!.bookingStatus, 'MANUAL');

  await GameUpdateService.updateGame(manualGame!.id, { hasBookedCourt: false }, user.id, false);
  let manualRow = await readStatus(manualGame!.id);
  assert.equal(manualRow!.bookingStatus, 'NONE');

  await GameUpdateService.updateGame(manualGame!.id, { hasBookedCourt: true }, user.id, false);
  manualRow = await readStatus(manualGame!.id);
  assert.equal(manualRow!.bookingStatus, 'MANUAL');

  await GameUpdateService.updateGame(manualGame!.id, { name: 'Renamed only' }, user.id, false);
  manualRow = await readStatus(manualGame!.id);
  assert.equal(manualRow!.bookingStatus, 'MANUAL');

  const linkedGame = await GameCreateService.createGame(
    {
      ...baseCreatePayload(user.currentCityId, start, end),
      externalBookingIds: [bookingA],
      externalBookingProvider: ClubIntegrationType.BOOKTIME,
      bookingSnapshots: [
        {
          externalBookingId: bookingA,
          bookingStart: start.toISOString(),
          bookingEnd: end.toISOString(),
        },
      ],
    },
    user.id,
    false,
  );
  assert.ok(linkedGame);
  assert.equal(linkedGame!.bookingStatus, 'EXTERNAL_FULL');

  await GameUpdateService.updateGame(
    linkedGame!.id,
    { maxParticipants: 8 },
    user.id,
    false,
  );
  let linkedRow = await readStatus(linkedGame!.id);
  assert.equal(linkedRow!.maxParticipants, 8);
  assert.equal(linkedRow!.bookingStatus, 'EXTERNAL_PARTIAL');

  await putGameBookingSnapshots(linkedGame!.id, user.id, false, {
    snapshots: [
      {
        externalBookingId: bookingA,
        bookingStart: new Date(start.getTime() - 3_600_000).toISOString(),
        bookingEnd: new Date(end.getTime() + 3_600_000).toISOString(),
      },
    ],
  });
  linkedRow = await readStatus(linkedGame!.id);
  assert.equal(linkedRow!.bookingStatus, 'EXTERNAL_PARTIAL');

  await patchGameBookings(linkedGame!.id, user.id, false, { add: [bookingB] });
  linkedRow = await readStatus(linkedGame!.id);
  assert.equal(linkedRow!.bookingStatus, 'EXTERNAL_FULL');

  await patchGameBookings(linkedGame!.id, user.id, false, { remove: [bookingA, bookingB] });
  linkedRow = await readStatus(linkedGame!.id);
  assert.equal(linkedRow!.bookingStatus, 'NONE');
  assert.equal(linkedRow!.hasBookedCourt, false);

  const linkFlowGame = await GameCreateService.createGame(
    baseCreatePayload(user.currentCityId, start, end),
    user.id,
    false,
  );
  assert.ok(linkFlowGame);
  await linkBookingToGame(linkFlowGame!.id, user.id, false, {
    externalBookingId: bookingA,
    snapshot: {
      externalBookingId: bookingA,
      bookingStart: start.toISOString(),
      bookingEnd: end.toISOString(),
    },
    gamePatch: { hasBookedCourt: true },
  });
  const linkFlowRow = await readStatus(linkFlowGame!.id);
  assert.equal(linkFlowRow!.bookingStatus, 'EXTERNAL_FULL');

  await cleanupGame(manualGame!.id);
  await cleanupGame(linkedGame!.id);
  await cleanupGame(linkFlowGame!.id);

  console.log('game-booking-status-sync: all passed');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
