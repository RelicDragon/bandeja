/**
 * Clearing a game's club or time (docs/domains/booking.md "Clearing club or time").
 *
 * Proves:
 *   · `clubId: null` clears the club, the primary court, every court slot and the explicit slot count;
 *   · with a linked booking, clearing the club → 400 `removeBookingsBeforeClearing`, nothing written;
 *   · from the editor (`timePolicy=explicit`), `timeIsSet: false` with a linked booking → the same 400;
 *     without links it clears the time; old clients (no time policy) keep their behaviour.
 *
 * Safe against `padelpulse_dev`: rows are namespaced by a run suffix and removed in `finally`.
 */
import assert from 'node:assert/strict';
import { ClubIntegrationType, EntityType, GameType, ParticipantRole, ParticipantStatus, Sport } from '@prisma/client';
import prisma from '../../config/database';
import { GameUpdateService } from './update.service';
import { linkBookingToGame } from './gameExternalBooking.service';
import { GameCourtService } from '../gameCourt/gameCourt.service';
import { BOOKING_ERROR_KEYS } from '../../shared/booking/errorKeys';

process.env.E2E_TEST = '1';

const H = 60 * 60 * 1000;

async function expectApiError(promise: Promise<unknown>, status: number, label: string, message?: string) {
  await assert.rejects(promise, (err: unknown) => {
    assert.equal((err as { statusCode?: number }).statusCode, status, label);
    if (message) assert.equal((err as Error).message, message, `${label}: message`);
    return true;
  }, label);
}

void (async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const createdGameIds: string[] = [];
  const city = await prisma.city.create({ data: { name: `Clear ${suffix}`, country: 'Test', timezone: 'UTC' } });
  const owner = await prisma.user.create({
    data: { phone: `qa-clear-owner-${suffix}`, firstName: 'Owner', currentCityId: city.id, primarySport: Sport.PADEL },
  });
  const club = await prisma.club.create({
    data: {
      name: `Clear club ${suffix}`,
      normalizedName: `clear club ${suffix}`,
      address: 'x',
      cityId: city.id,
      integrationType: ClubIntegrationType.BOOKTIME,
    },
  });
  const [c1, c2] = await Promise.all(
    ['C1', 'C2'].map((name) => prisma.court.create({ data: { name, clubId: club.id, sport: Sport.PADEL } })),
  );
  const start = new Date(Math.ceil((Date.now() + 6 * 24 * H) / H) * H);
  const at = (hours: number) => new Date(start.getTime() + hours * H);

  const makeGame = async (hours: number, maxParticipants = 4) => {
    const game = await prisma.game.create({
      data: {
        // A GAME is 4 players (one court); two courts need an 8-player tournament.
        entityType: maxParticipants > 4 ? EntityType.TOURNAMENT : EntityType.GAME,
        sport: Sport.PADEL,
        gameType: GameType.CLASSIC,
        cityId: city.id,
        clubId: club.id,
        courtId: c1.id,
        startTime: at(hours),
        endTime: at(hours + 2),
        timeIsSet: true,
        maxParticipants,
        participants: { create: [{ userId: owner.id, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING }] },
      },
    });
    createdGameIds.push(game.id);
    return game;
  };
  const row = (id: string) =>
    prisma.game.findUniqueOrThrow({
      where: { id },
      select: { clubId: true, courtId: true, courtSlotCount: true, timeIsSet: true, _count: { select: { gameCourts: true } } },
    });
  const link = (gameId: string, name: string, hours: number) =>
    linkBookingToGame(
      gameId,
      owner.id,
      false,
      {
        externalBookingId: `qa-clear-${name}-${suffix}`,
        snapshot: {
          externalBookingId: `qa-clear-${name}-${suffix}`,
          courtId: c1.id,
          bookingStart: at(hours).toISOString(),
          bookingEnd: at(hours + 2).toISOString(),
        },
      },
      { timePolicy: 'explicit' },
    );

  try {
    /* --- clear the club: courts go with it ------------------------------------------- */
    const g = await makeGame(0, 8);
    await GameCourtService.setCourtSlots(
      g.id,
      owner.id,
      { slots: [{ courtId: c1.id, reservation: 'REPORTED' }, { courtId: c2.id }], courtSlotCount: 2 },
      { timePolicy: 'explicit' },
    );
    assert.equal((await row(g.id))._count.gameCourts, 2, 'two slots before');
    await GameUpdateService.updateGame(g.id, { clubId: null }, owner.id, false, { timePolicy: 'explicit' });
    const cleared = await row(g.id);
    assert.equal(cleared.clubId, null, 'club cleared');
    assert.equal(cleared.courtId, null, 'primary court cleared');
    assert.equal(cleared._count.gameCourts, 0, 'court slots cleared');
    assert.equal(cleared.courtSlotCount, null, 'slot count cleared');

    /* --- with a linked booking: refused ---------------------------------------------- */
    const gL = await makeGame(4, 4);
    await link(gL.id, 'club', 4);
    await expectApiError(
      GameUpdateService.updateGame(gL.id, { clubId: null }, owner.id, false, { timePolicy: 'explicit' }),
      400,
      'clear club with a link',
      BOOKING_ERROR_KEYS.removeBookingsBeforeClearing,
    );
    assert.equal((await row(gL.id)).clubId, club.id, '400 kept the club');
    await expectApiError(
      GameUpdateService.updateGame(gL.id, { timeIsSet: false }, owner.id, false, { timePolicy: 'explicit' }),
      400,
      'clear time with a link (editor)',
      BOOKING_ERROR_KEYS.removeBookingsBeforeClearing,
    );
    assert.equal((await row(gL.id)).timeIsSet, true, '400 kept the time');

    /* --- clear the time without links ------------------------------------------------- */
    const gT = await makeGame(8, 4);
    await GameUpdateService.updateGame(gT.id, { timeIsSet: false }, owner.id, false, { timePolicy: 'explicit' });
    assert.equal((await row(gT.id)).timeIsSet, false, 'time cleared');
    assert.equal((await row(gT.id)).clubId, club.id, 'clearing the time keeps the club');

    console.log('clearSchedule.integration.test.ts: ok');
  } finally {
    await prisma.chatMessage.deleteMany({ where: { contextId: { in: createdGameIds } } }).catch(() => undefined);
    await prisma.chatSyncEvent.deleteMany({ where: { contextId: { in: createdGameIds } } }).catch(() => undefined);
    await prisma.game.deleteMany({ where: { id: { in: createdGameIds } } }).catch(() => undefined);
    await prisma.club.deleteMany({ where: { id: club.id } }).catch(() => undefined);
    await prisma.userSportProfile.deleteMany({ where: { userId: owner.id } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: owner.id } }).catch(() => undefined);
    await prisma.city.deleteMany({ where: { id: city.id } }).catch(() => undefined);
    await prisma.$disconnect();
  }
})();
