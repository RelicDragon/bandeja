import assert from 'node:assert/strict';
import prisma from '../../src/config/database';
import { ApiError } from '../../src/utils/ApiError';
import { GameCreateService } from '../../src/services/game/create.service';
import { linkBookingToGame } from '../../src/services/game/gameExternalBooking.service';
import { BOOKING_ERROR_KEYS } from '@bandeja/shared/booking/errorKeys';

async function getTestUsers() {
  return prisma.user.findMany({
    where: { isActive: true, currentCityId: { not: null } },
    select: { id: true, currentCityId: true, isAdmin: true },
    take: 2,
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

function snapshotFor(bookingId: string, start: Date, end: Date) {
  return {
    externalBookingId: bookingId,
    bookingStart: start.toISOString(),
    bookingEnd: end.toISOString(),
  };
}

async function cleanupGame(gameId: string) {
  await prisma.gameExternalBooking.deleteMany({ where: { gameId } });
  await prisma.gameParticipant.deleteMany({ where: { gameId } });
  await prisma.game.delete({ where: { id: gameId } });
}

async function main() {
  const users = await getTestUsers();
  if (users.length < 2 || !users[0]?.currentCityId) {
    console.log('skip: game-link-booking (need 2 active users with city)');
    return;
  }

  const owner = users[0];
  const stranger = users[1]!;
  const cityId = owner.currentCityId!;
  const start = new Date(Date.now() + 86_400_000);
  const end = new Date(start.getTime() + 7_200_000);
  const bookingId = '33333333-3333-3333-3333-333333333333';

  const game = await GameCreateService.createGame(baseCreatePayload(cityId, start, end), owner.id, false);
  assert.ok(game);

  try {
    const rows = await linkBookingToGame(game!.id, owner.id, false, {
      externalBookingId: bookingId,
      snapshot: snapshotFor(bookingId, start, end),
      gamePatch: { hasBookedCourt: true },
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.externalBookingId, bookingId);
    assert.ok(rows[0]!.bookingStart);
    assert.ok(rows[0]!.bookingEnd);

    const linkedGame = await prisma.game.findUnique({
      where: { id: game!.id },
      select: {
        hasBookedCourt: true,
        bookingStatus: true,
        startTime: true,
        endTime: true,
        timeIsSet: true,
      },
    });
    assert.ok(linkedGame);
    assert.equal(linkedGame!.hasBookedCourt, true);
    assert.equal(linkedGame!.bookingStatus, 'EXTERNAL_FULL');
    assert.equal(linkedGame!.timeIsSet, true);
    assert.equal(linkedGame!.startTime.toISOString(), start.toISOString());
    assert.equal(linkedGame!.endTime.toISOString(), end.toISOString());

    try {
      await linkBookingToGame(game!.id, owner.id, false, {
        externalBookingId: bookingId,
        snapshot: snapshotFor(bookingId, start, end),
      });
      assert.fail('duplicate link should fail');
    } catch (err) {
      assert.ok(err instanceof ApiError);
      assert.equal(err.statusCode, 400);
      assert.equal(err.message, BOOKING_ERROR_KEYS.alreadyLinked);
    }

    try {
      await linkBookingToGame(game!.id, stranger.id, false, {
        externalBookingId: '44444444-4444-4444-4444-444444444444',
        snapshot: snapshotFor('44444444-4444-4444-4444-444444444444', start, end),
      });
      assert.fail('stranger should be forbidden');
    } catch (err) {
      assert.ok(err instanceof ApiError);
      assert.equal(err.statusCode, 403);
      assert.equal(err.message, BOOKING_ERROR_KEYS.updateLinksForbidden);
    }

    const rollbackGame = await GameCreateService.createGame(
      baseCreatePayload(cityId, start, end),
      owner.id,
      false,
    );
    assert.ok(rollbackGame);
    const rollbackBookingId = '55555555-5555-5555-5555-555555555555';

    try {
      await linkBookingToGame(rollbackGame!.id, owner.id, false, {
        externalBookingId: rollbackBookingId,
        snapshot: snapshotFor(rollbackBookingId, start, end),
        gamePatch: { clubId: 'nonexistent-club-id-for-rollback-test' },
      });
      assert.fail('invalid clubId should fail and roll back');
    } catch {
      // expected
    }

    const orphanRows = await prisma.gameExternalBooking.count({
      where: { gameId: rollbackGame!.id },
    });
    assert.equal(orphanRows, 0);

    await cleanupGame(rollbackGame!.id);
  } finally {
    await cleanupGame(game!.id);
  }

  console.log('game-link-booking: all passed');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
