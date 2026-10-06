/**
 * "Game only" court booking mode against a real database (docs/domains/booking.md "Game only").
 *
 * Proves:
 *   · create / update accept `courtBookingMode` (CLUB | GAME_ONLY), anything else → 400;
 *     omitted = CLUB / unchanged (old clients);
 *   · the hard-clash guard never checks a GAME_ONLY game;
 *   · links win: linking a booking (link-booking, create with bookingIds) flips GAME_ONLY → CLUB
 *     in the same transaction;
 *   · explicit GAME_ONLY while links exist → 400 `gameDetails.courts.gameOnlyHasLinks`;
 *   · game detail and court-slot view carry the field.
 *
 * Safe against `padelpulse_dev`: rows are namespaced by a run suffix and removed in `finally`.
 * Outbound notifications are suppressed.
 */
import assert from 'node:assert/strict';
import { ClubIntegrationType, EntityType, GameType, ParticipantRole, ParticipantStatus, Sport } from '@prisma/client';
import prisma from '../../config/database';
import { GameCreateService } from './create.service';
import { GameUpdateService } from './update.service';
import { GameReadService } from './read.service';
import { linkBookingToGame } from './gameExternalBooking.service';
import { GameCourtService } from '../gameCourt/gameCourt.service';
import { GAME_ONLY_HAS_LINKS_KEY } from './courtBookingMode';

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
  const city = await prisma.city.create({
    data: { name: `Game only ${suffix}`, country: 'Test', timezone: 'UTC' },
  });
  const owner = await prisma.user.create({
    data: { phone: `qa-gameonly-owner-${suffix}`, firstName: 'Owner', currentCityId: city.id, primarySport: Sport.PADEL },
  });
  const club = await prisma.club.create({
    data: {
      name: `Game only club ${suffix}`,
      normalizedName: `game only club ${suffix}`,
      address: 'x',
      cityId: city.id,
      integrationType: ClubIntegrationType.BOOKTIME,
    },
  });
  const [c1, c2] = await Promise.all(
    ['C1', 'C2'].map((name) => prisma.court.create({ data: { name, clubId: club.id, sport: Sport.PADEL } })),
  );

  const start = new Date(Math.ceil((Date.now() + 5 * 24 * H) / H) * H);
  const end = new Date(start.getTime() + 2 * H);
  const at = (hours: number) => new Date(start.getTime() + hours * H);

  const makeGame = async (over: { courtId?: string; startTime?: Date; endTime?: Date } = {}) => {
    const game = await prisma.game.create({
      data: {
        entityType: EntityType.GAME,
        sport: Sport.PADEL,
        gameType: GameType.CLASSIC,
        cityId: city.id,
        clubId: club.id,
        courtId: over.courtId ?? null,
        startTime: over.startTime ?? start,
        endTime: over.endTime ?? end,
        timeIsSet: true,
        maxParticipants: 4,
        participants: {
          create: [{ userId: owner.id, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING }],
        },
      },
    });
    createdGameIds.push(game.id);
    return game;
  };
  const mode = async (gameId: string) =>
    (await prisma.game.findUniqueOrThrow({ where: { id: gameId }, select: { courtBookingMode: true } })).courtBookingMode;
  const bookingId = (name: string) => `qa-gameonly-${name}-${suffix}`;
  const createBody = (over: Record<string, unknown> = {}) => ({
    entityType: 'GAME',
    gameType: 'CLASSIC',
    clubId: club.id,
    courtId: c1.id,
    startTime: at(24).toISOString(),
    endTime: at(26).toISOString(),
    timeIsSet: true,
    ...over,
  });
  const track = (game: { id: string } | null) => {
    if (game) createdGameIds.push(game.id);
    return game as { id: string; courtBookingMode?: string };
  };

  try {
    /* --- create: accept, default, validate ------------------------------------------ */
    const created = track(await GameCreateService.createGame(createBody({ courtBookingMode: 'GAME_ONLY' }), owner.id));
    assert.equal(created.courtBookingMode, 'GAME_ONLY', 'create response carries GAME_ONLY');
    assert.equal(await mode(created.id), 'GAME_ONLY');
    const createdDefault = track(await GameCreateService.createGame(createBody(), owner.id));
    assert.equal(await mode(createdDefault.id), 'CLUB', 'omitted → CLUB (old clients)');
    await expectApiError(
      GameCreateService.createGame(createBody({ courtBookingMode: 'MAYBE' }), owner.id),
      400,
      'create rejects an unknown mode',
    );
    await expectApiError(
      GameCreateService.createGame(createBody({ courtBookingMode: null }), owner.id),
      400,
      'create rejects null',
    );

    // Create with GAME_ONLY + a booking to link → CLUB wins.
    const createdLinked = track(
      await GameCreateService.createGame(
        createBody({
          courtBookingMode: 'GAME_ONLY',
          externalBookingIds: [bookingId('create')],
          externalBookingProvider: 'BOOKTIME',
          bookingSnapshots: [
            {
              externalBookingId: bookingId('create'),
              courtId: c1.id,
              bookingStart: at(24).toISOString(),
              bookingEnd: at(26).toISOString(),
            },
          ],
        }),
        owner.id,
      ),
    );
    assert.equal(await mode(createdLinked.id), 'CLUB', 'create with bookingIds → CLUB');

    /* --- detail payload ----------------------------------------------------------- */
    const detail = (await GameReadService.getGameById(created.id, owner.id)) as { courtBookingMode?: string };
    assert.equal(detail.courtBookingMode, 'GAME_ONLY', 'game detail carries courtBookingMode');

    /* --- update: accept, validate, unchanged when omitted -------------------------- */
    const gU = await makeGame({ courtId: c1.id });
    const updated = (await GameUpdateService.updateGame(gU.id, { courtBookingMode: 'GAME_ONLY' }, owner.id, false)) as {
      courtBookingMode?: string;
    };
    assert.equal(updated.courtBookingMode, 'GAME_ONLY', 'update response carries the mode');
    await GameUpdateService.updateGame(gU.id, { name: `renamed ${suffix}` }, owner.id, false);
    assert.equal(await mode(gU.id), 'GAME_ONLY', 'omitted on update → unchanged');
    await expectApiError(
      GameUpdateService.updateGame(gU.id, { courtBookingMode: 'game_only' }, owner.id, false),
      400,
      'update rejects an unknown mode',
    );
    await GameUpdateService.updateGame(gU.id, { courtBookingMode: 'CLUB' }, owner.id, false);
    assert.equal(await mode(gU.id), 'CLUB', 'back to CLUB');

    /* --- clash guard skip ---------------------------------------------------------- */
    // gA holds a reserved C1 slot at [start, end].
    const gA = await makeGame({ courtId: c1.id });
    await GameCourtService.setCourtSlots(gA.id, owner.id, { slots: [{ courtId: c1.id, reservation: 'REPORTED' }] });
    // A CLUB game moving onto it → 409.
    const gClub = await makeGame({ courtId: c1.id, startTime: at(5), endTime: at(7) });
    await expectApiError(
      GameUpdateService.updateGame(gClub.id, { startTime: start.toISOString(), endTime: end.toISOString() }, owner.id, false, {
        timePolicy: 'explicit',
      }),
      409,
      'CLUB game is clash-checked',
    );
    // The same move for a GAME_ONLY game is never blocked.
    const gOnly = await makeGame({ courtId: c1.id, startTime: at(5), endTime: at(7) });
    await GameUpdateService.updateGame(gOnly.id, { courtBookingMode: 'GAME_ONLY' }, owner.id, false);
    await GameUpdateService.updateGame(gOnly.id, { startTime: start.toISOString(), endTime: end.toISOString() }, owner.id, false, {
      timePolicy: 'explicit',
    });
    assert.equal(
      (await prisma.game.findUniqueOrThrow({ where: { id: gOnly.id } })).startTime.getTime(),
      start.getTime(),
      'GAME_ONLY game moved without a clash check',
    );
    // Adding a court slot is not checked either.
    await GameCourtService.setCourtSlots(gOnly.id, owner.id, { slots: [{ courtId: c1.id }, { courtId: c2.id }] }, { timePolicy: 'explicit' });

    /* --- switching back to club booking is clash-checked (explicit only) ------------- */
    // C1 is busy at gOnly's window (gA's reserved slot): back to CLUB → 409, nothing written.
    await expectApiError(
      GameUpdateService.updateGame(gOnly.id, { courtBookingMode: 'CLUB' }, owner.id, false, { timePolicy: 'explicit' }),
      409,
      'GAME_ONLY → CLUB on a busy window',
    );
    assert.equal(await mode(gOnly.id), 'GAME_ONLY', '409 rolled the switch back');
    // "Is this your booking?" → the organizer reports C1; the retry passes.
    await GameCourtService.setCourtSlots(gOnly.id, owner.id, {
      slots: [{ courtId: c1.id, reservation: 'REPORTED' }, { courtId: c2.id }],
    });
    await GameUpdateService.updateGame(gOnly.id, { courtBookingMode: 'CLUB' }, owner.id, false, { timePolicy: 'explicit' });
    assert.equal(await mode(gOnly.id), 'CLUB', 'REPORTED slot → switch back succeeds');
    // Old clients (no policy) are never clash-checked.
    const gOldClient = await makeGame({ courtId: c1.id });
    await GameUpdateService.updateGame(gOldClient.id, { courtBookingMode: 'GAME_ONLY' }, owner.id, false);
    await GameUpdateService.updateGame(gOldClient.id, { courtBookingMode: 'CLUB' }, owner.id, false);
    assert.equal(await mode(gOldClient.id), 'CLUB', 'no policy → no clash check');

    /* --- links win ----------------------------------------------------------------- */
    const gL = await makeGame({ courtId: c2.id, startTime: at(10), endTime: at(12) });
    await GameUpdateService.updateGame(gL.id, { courtBookingMode: 'GAME_ONLY' }, owner.id, false);
    await linkBookingToGame(
      gL.id,
      owner.id,
      false,
      {
        externalBookingId: bookingId('link'),
        snapshot: { externalBookingId: bookingId('link'), courtId: c2.id, bookingStart: at(10).toISOString(), bookingEnd: at(12).toISOString() },
      },
      { timePolicy: 'explicit' },
    );
    assert.equal(await mode(gL.id), 'CLUB', 'link-booking flips GAME_ONLY → CLUB');
    const slotView = (await GameCourtService.getCourtSlotView(gL.id)) as { courtBookingMode?: string };
    assert.equal(slotView.courtBookingMode, 'CLUB', 'slot view carries the mode');

    // Explicit GAME_ONLY while a link exists → 400, nothing written.
    await expectApiError(
      GameUpdateService.updateGame(gL.id, { courtBookingMode: 'GAME_ONLY', name: `x ${suffix}` }, owner.id, false),
      400,
      'GAME_ONLY with links',
      GAME_ONLY_HAS_LINKS_KEY,
    );
    const gLRow = await prisma.game.findUniqueOrThrow({ where: { id: gL.id }, select: { courtBookingMode: true, name: true } });
    assert.equal(gLRow.courtBookingMode, 'CLUB', '400 rolled back');
    assert.notEqual(gLRow.name, `x ${suffix}`, '400 rolled back the rest of the patch');

    console.log('courtBookingMode.integration.test.ts: ok');
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
