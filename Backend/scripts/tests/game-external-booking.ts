import assert from 'node:assert/strict';
import { ClubIntegrationType } from '@prisma/client';
import prisma from '../../src/config/database';
import { ApiError } from '../../src/utils/ApiError';
import { GameCreateService } from '../../src/services/game/create.service';
import { GameUpdateService } from '../../src/services/game/update.service';
import {
  patchGameBookings,
  putGameBookingSnapshots,
} from '../../src/services/game/gameExternalBooking.service';
import { findLinkedGamesForBooking } from '../../src/services/booktime/booktimeGameLink.service';
import { LEGACY_EXTERNAL_BOOKING_ID_REJECTED } from '../../src/shared/gameBooking/contracts';

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

async function main() {
  const user = await getTestUser();
  if (!user?.currentCityId) {
    console.log('skip: game-external-booking (no active user with city)');
    return;
  }

  const start = new Date(Date.now() + 86_400_000);
  const end = new Date(start.getTime() + 7_200_000);
  const bookingA = '11111111-1111-1111-1111-111111111111';
  const bookingB = '22222222-2222-2222-2222-222222222222';

  try {
    await GameCreateService.createGame(
      { ...baseCreatePayload(user.currentCityId, start, end), externalBookingId: bookingA },
      user.id,
      false,
    );
    assert.fail('legacy externalBookingId should be rejected');
  } catch (err) {
    assert.ok(err instanceof ApiError);
    assert.equal(err.message, LEGACY_EXTERNAL_BOOKING_ID_REJECTED);
  }

  const game0 = await GameCreateService.createGame(
    baseCreatePayload(user.currentCityId, start, end),
    user.id,
    false,
  );
  assert.ok(game0);
  assert.equal(game0!.linkedBookings.length, 0);
  assert.equal(game0!.hasBookedCourt, false);

  const game1 = await GameCreateService.createGame(
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
      hasBookedCourt: true,
    },
    user.id,
    false,
  );
  assert.ok(game1);
  assert.equal(game1!.linkedBookings.length, 1);
  assert.equal(game1!.hasBookedCourt, true);
  assert.equal(game1!.linkedBookings[0].externalBookingId, bookingA);

  const game2 = await GameCreateService.createGame(
    {
      ...baseCreatePayload(user.currentCityId, start, end),
      externalBookingIds: [bookingA],
      externalBookingProvider: ClubIntegrationType.BOOKTIME,
    },
    user.id,
    false,
  );
  assert.ok(game2);
  assert.equal(game2!.linkedBookings[0].externalBookingId, bookingA);

  const linked = await findLinkedGamesForBooking(bookingA);
  assert.equal(linked.length, 2);

  try {
    await patchGameBookings(game1!.id, user.id, false, { add: [bookingA] });
    assert.fail('duplicate on same game should fail');
  } catch (err) {
    assert.ok(err instanceof ApiError);
    assert.equal(err.statusCode, 400);
  }

  await patchGameBookings(game1!.id, user.id, false, { add: [bookingB] });
  const rows = await prisma.gameExternalBooking.findMany({ where: { gameId: game1!.id } });
  assert.equal(rows.length, 2);

  await putGameBookingSnapshots(game1!.id, user.id, false, {
    snapshots: [
      {
        externalBookingId: bookingB,
        bookingStart: new Date(start.getTime() - 3_600_000).toISOString(),
        bookingEnd: new Date(end.getTime() + 3_600_000).toISOString(),
      },
    ],
  });

  const afterSnap = await prisma.game.findUnique({
    where: { id: game1!.id },
    select: { timeOverride: true, startTime: true, endTime: true },
  });
  assert.ok(afterSnap);
  assert.equal(afterSnap!.timeOverride, false);

  try {
    await GameUpdateService.updateGame(game1!.id, { hasBookedCourt: false }, user.id, false);
    assert.fail('hasBookedCourt false with links should fail');
  } catch (err) {
    assert.ok(err instanceof ApiError);
    assert.equal(err.statusCode, 400);
  }

  await patchGameBookings(game1!.id, user.id, false, { remove: [bookingA, bookingB] });
  const cleared = await prisma.game.findUnique({
    where: { id: game1!.id },
    select: { hasBookedCourt: true },
  });
  assert.equal(cleared!.hasBookedCourt, false);

  await cleanupGame(game0!.id);
  await cleanupGame(game1!.id);
  await cleanupGame(game2!.id);

  console.log('game-external-booking: all passed');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
