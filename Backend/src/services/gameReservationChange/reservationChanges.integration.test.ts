/**
 * Court-booking redesign, backend half, against a real database
 * (docs/domains/booking.md "Court slots", "Clash guard", "Club-side drift", "Reschedule journal").
 *
 * Proves:
 *   · occupancy: one game block per court slot, per-slot `reservation`, `gameId`; court filter;
 *   · clash guard: `timePolicy=explicit` PUT game / PUT court-slots → 409 `court.clash` with
 *     details and nothing written; old clients unchanged; planned games and REPORTED slots exempt;
 *   · drift: mirror sync marks MOVED / MISSING / OK (never moves the game or link); range and
 *     `complete` respected; client upstream-check;
 *   · accept-upstream: keep_game (link only) and move_game (game moves once, attendance reset);
 *   · journal: create / resume / 409 running / stale takeover, monotonic idempotent steps,
 *     finish rules, save-game atomic + rollback on clash + idempotent retry, follow-ups on the
 *     game payload for organizers only.
 *
 * Safe against `padelpulse_dev`: rows are namespaced by a run suffix and removed in `finally`.
 * Outbound notifications are suppressed.
 */
import assert from 'node:assert/strict';
import { ClubIntegrationType, EntityType, GameType, ParticipantRole, ParticipantStatus, Sport } from '@prisma/client';
import prisma from '../../config/database';
import { CourtOccupancyService } from '../game/courtOccupancy.service';
import { BookedCourtsService } from '../game/bookedCourts.service';
import { GameCourtService } from '../gameCourt/gameCourt.service';
import { findCourtClashes } from '../gameCourt/courtClash.service';
import { GameUpdateService } from '../game/update.service';
import { GameReadService } from '../game/read.service';
import { projectGameForBroadcast } from '../game/gameDetail.projection';
import { linkBookingToGame } from '../game/gameExternalBooking.service';
import {
  externalBookingMirrorSyncBodySchema,
  syncExternalBookingMirror,
} from '../bookingMirror/externalBookingMirror.service';
import { acceptUpstreamDrift, recordUpstreamCheck } from '../game/bookingUpstreamDrift.service';
import {
  canTransitionStep,
  createReservationChange,
  finishReservationChange,
  getActiveReservationChange,
  patchReservationChangeStep,
  saveGameForReservationChange,
} from './reservationChange.service';

process.env.E2E_TEST = '1';

const MIN = 60 * 1000;
const H = 60 * MIN;

async function expectApiError(promise: Promise<unknown>, status: number, label: string, code?: string) {
  let caught: { statusCode?: number; data?: Record<string, unknown> } | null = null;
  await assert.rejects(promise, (err: unknown) => {
    caught = err as typeof caught;
    assert.equal((err as { statusCode?: number }).statusCode, status, label);
    if (code) assert.equal((err as { data?: { code?: string } }).data?.code, code, `${label}: code`);
    return true;
  }, label);
  return caught as unknown as { statusCode: number; data: Record<string, unknown> };
}

void (async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const createdGameIds: string[] = [];
  const city = await prisma.city.create({
    data: { name: `Reservation changes ${suffix}`, country: 'Test', timezone: 'UTC' },
  });
  const owner = await prisma.user.create({
    data: { phone: `qa-resv-owner-${suffix}`, firstName: 'Owner', currentCityId: city.id, primarySport: Sport.PADEL },
  });
  const player = await prisma.user.create({
    data: { phone: `qa-resv-player-${suffix}`, firstName: 'Player', currentCityId: city.id, primarySport: Sport.PADEL },
  });
  const club = await prisma.club.create({
    data: {
      name: `Resv club ${suffix}`,
      normalizedName: `resv club ${suffix}`,
      address: 'x',
      cityId: city.id,
      integrationType: ClubIntegrationType.BOOKTIME,
    },
  });
  const [c1, c2, c3, c4] = await Promise.all(
    ['C1', 'C2', 'C3', 'C4'].map((name) => prisma.court.create({ data: { name, clubId: club.id, sport: Sport.PADEL } })),
  );

  const start = new Date(Math.ceil((Date.now() + 4 * 24 * H) / H) * H);
  const end = new Date(start.getTime() + 2 * H);
  const at = (hours: number) => new Date(start.getTime() + hours * H);

  // Multi-court games are 8-player tournaments: a 4-player game is capped at one court.
  const makeGame = async (
    over: { courtId?: string | null; startTime?: Date; endTime?: Date; maxParticipants?: number; multiCourt?: boolean } = {},
  ) => {
    const game = await prisma.game.create({
      data: {
        entityType: over.multiCourt ? EntityType.TOURNAMENT : EntityType.GAME,
        sport: Sport.PADEL,
        gameType: GameType.CLASSIC,
        cityId: city.id,
        clubId: club.id,
        courtId: over.courtId ?? null,
        startTime: over.startTime ?? start,
        endTime: over.endTime ?? end,
        timeIsSet: true,
        maxParticipants: over.maxParticipants ?? (over.multiCourt ? 8 : 4),
        participants: {
          create: [
            { userId: owner.id, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING },
            { userId: player.id, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.PLAYING, attendance: 'CONFIRMED' },
          ],
        },
      },
    });
    createdGameIds.push(game.id);
    return game;
  };
  const gameRow = (gameId: string) => prisma.game.findUniqueOrThrow({ where: { id: gameId } });
  const bookingId = (name: string) => `qa-resv-${name}-${suffix}`;
  const link = (gameId: string, name: string, courtId: string, s: Date, e: Date) =>
    linkBookingToGame(
      gameId,
      owner.id,
      false,
      {
        externalBookingId: bookingId(name),
        snapshot: { externalBookingId: bookingId(name), courtId, bookingStart: s.toISOString(), bookingEnd: e.toISOString() },
      },
      { timePolicy: 'explicit' },
    );
  const linkRow = (gameId: string, name: string) =>
    prisma.gameExternalBooking.findFirstOrThrow({ where: { gameId, externalBookingId: bookingId(name) } });

  try {
    /* --- occupancy: every court slot, per-slot reservation ------------------------ */
    const gA = await makeGame({ courtId: c1.id, multiCourt: true });
    await GameCourtService.setCourtSlots(gA.id, owner.id, {
      slots: [
        { courtId: c1.id, reservation: 'REPORTED' },
        { courtId: c2.id, reservation: 'NONE' },
      ],
    });
    let occ = await CourtOccupancyService.getOccupancy({ clubId: club.id, rangeStart: start, rangeEnd: end, sources: { games: true, holds: false, externals: false } });
    const aBlocks = occ.blocks.filter((b) => b.gameId === gA.id);
    assert.deepEqual(
      aBlocks.map((b) => [b.courtId, b.reservation, b.hasBookedCourt]),
      [
        [c1.id, 'reserved', true],
        [c2.id, 'planned', true],
      ],
      'one block per slot; hasBookedCourt keeps the game-level meaning',
    );
    occ = await CourtOccupancyService.getOccupancy({ clubId: club.id, rangeStart: start, rangeEnd: end, courtId: c2.id, sources: { games: true, holds: false, externals: false } });
    assert.deepEqual(occ.blocks.filter((b) => b.gameId === gA.id).map((b) => b.courtId), [c2.id], 'court filter: second slot found');
    const booked = await BookedCourtsService.getBookedCourts(club.id, start.toISOString(), end.toISOString());
    const bookedA = booked.slots.filter((slot) => slot.gameId === gA.id);
    assert.equal(bookedA.length, 2, 'player view shows both courts');
    assert.deepEqual(bookedA.map((slot) => slot.reservation).sort(), ['planned', 'reserved']);

    /* --- clash guard ---------------------------------------------------------------- */
    // gB elsewhere in time on C1; moving it onto gA's reserved C1 → 409 (explicit only).
    const gB = await makeGame({ courtId: c1.id, startTime: at(5), endTime: at(7) });
    const clash = await expectApiError(
      GameUpdateService.updateGame(gB.id, { startTime: start.toISOString(), endTime: end.toISOString() }, owner.id, false, { timePolicy: 'explicit' }),
      409,
      'explicit move onto a reserved slot',
      'court.clash',
    );
    assert.deepEqual(clash.data.details, [
      { courtId: c1.id, start: start.toISOString(), end: end.toISOString(), kind: 'app_game_reserved', gameId: gA.id },
    ]);
    assert.equal((await gameRow(gB.id)).startTime.getTime(), at(5).getTime(), '409 rolled the move back');

    // gA's C2 slot is only planned: a game moving onto C2 is not blocked.
    const gC = await makeGame({ courtId: c2.id, startTime: at(5), endTime: at(7), multiCourt: true });
    await GameUpdateService.updateGame(gC.id, { startTime: start.toISOString(), endTime: end.toISOString() }, owner.id, false, { timePolicy: 'explicit' });
    assert.equal((await gameRow(gC.id)).startTime.getTime(), start.getTime(), 'planned games never block');

    // Old clients: same move as gB succeeds.
    const gOld = await makeGame({ courtId: c1.id, startTime: at(5), endTime: at(7) });
    await GameUpdateService.updateGame(gOld.id, { startTime: start.toISOString(), endTime: end.toISOString() }, owner.id, false);
    assert.equal((await gameRow(gOld.id)).startTime.getTime(), start.getTime(), 'no policy → unchanged behaviour');

    // Admin hold on C3: adding C3 via court-slots → 409 (explicit only), nothing written.
    await prisma.courtSlotHold.create({
      data: { clubId: club.id, courtId: c3.id, startTime: at(1), endTime: at(2), label: 'WALK_IN', createdByUserId: owner.id },
    });
    const hold = await expectApiError(
      GameCourtService.setCourtSlots(gC.id, owner.id, { slots: [{ courtId: c2.id }, { courtId: c3.id }] }, { timePolicy: 'explicit' }),
      409,
      'hold on an added court',
      'court.clash',
    );
    assert.deepEqual((hold.data.details as Array<{ kind: string; courtId: string }>).map((d) => [d.kind, d.courtId]), [['hold', c3.id]]);
    assert.deepEqual((await prisma.gameCourt.findMany({ where: { gameId: gC.id } })).map((s) => s.courtId), [c2.id], 'rolled back');
    // A REPORTED slot is exempt (the planner says "tell the club").
    await GameCourtService.setCourtSlots(gC.id, owner.id, { slots: [{ courtId: c2.id }, { courtId: c3.id, reservation: 'REPORTED' }] }, { timePolicy: 'explicit' });
    // Old clients add the held court without complaint.
    await GameCourtService.setCourtSlots(gC.id, owner.id, { slots: [{ courtId: c2.id }, { courtId: c3.id }] });
    await GameCourtService.setCourtSlots(gC.id, owner.id, { slots: [{ courtId: c2.id }] });

    // Pure core: club blocks clash only outside this game's own bookings; shared games never.
    const pure = findCourtClashes({
      gameId: 'g',
      window: { start, end },
      slots: [
        { courtId: 'k1', reservation: 'NONE', links: [{ start, end: at(1) }] },
        { courtId: 'k2', reservation: 'NONE', links: [] },
      ],
      blocks: [
        { kind: 'external', courtId: 'k1', courtName: null, integrationCourtName: null, startTime: start.toISOString(), endTime: at(1).toISOString(), hasBookedCourt: true, clubBooked: true, isFree: false },
        { kind: 'external', courtId: 'k1', courtName: null, integrationCourtName: null, startTime: at(1.5).toISOString(), endTime: at(3).toISOString(), hasBookedCourt: true, clubBooked: true, isFree: false },
        { kind: 'game', gameId: 'shared', reservation: 'reserved', courtId: 'k2', courtName: null, integrationCourtName: null, startTime: start.toISOString(), endTime: end.toISOString(), hasBookedCourt: true, clubBooked: false, isFree: false },
      ],
      sharedGameIds: new Set(['shared']),
    });
    assert.deepEqual(pure.map((c) => [c.courtId, c.kind, c.start]), [['k1', 'club', at(1.5).toISOString()]], 'own booking echo ignored, gap clash found');

    /* --- drift from the mirror sync -------------------------------------------------- */
    const gD = await makeGame({ courtId: c4.id, startTime: at(24), endTime: at(26) });
    await link(gD.id, 'moved', c4.id, at(24), at(26));
    const gD2 = await makeGame({ courtId: c4.id, startTime: at(30), endTime: at(32) });
    await link(gD2.id, 'gone', c4.id, at(30), at(32));
    const gD3 = await makeGame({ courtId: c4.id, startTime: at(36), endTime: at(38) });
    await link(gD3.id, 'same', c4.id, at(36), at(38));
    const gD4 = await makeGame({ courtId: c4.id, startTime: at(24 * 20), endTime: at(24 * 20 + 2) });
    await link(gD4.id, 'far', c4.id, at(24 * 20), at(24 * 20 + 2));
    for (const name of ['moved', 'gone', 'same', 'far']) {
      assert.equal((await prisma.gameExternalBooking.findFirstOrThrow({ where: { externalBookingId: bookingId(name) } })).upstreamState, 'OK');
    }

    const syncBody = (complete: boolean) =>
      externalBookingMirrorSyncBodySchema.parse({
        provider: 'BOOKTIME',
        clubId: club.id,
        rangeFrom: at(0).toISOString(),
        rangeTo: at(24 * 7).toISOString(),
        complete,
        bookings: [
          { externalBookingId: bookingId('moved'), start: at(25).toISOString(), end: at(27).toISOString() },
          { externalBookingId: bookingId('same'), start: at(36).toISOString(), end: at(38).toISOString() },
        ],
      });
    await syncExternalBookingMirror(owner.id, syncBody(false));
    assert.equal((await linkRow(gD2.id, 'gone')).upstreamState, 'OK', 'incomplete list: absence proves nothing');
    await syncExternalBookingMirror(owner.id, syncBody(true));
    let moved = await linkRow(gD.id, 'moved');
    assert.equal(moved.upstreamState, 'MOVED');
    assert.equal(moved.upstreamStart?.getTime(), at(25).getTime());
    assert.equal(moved.upstreamEnd?.getTime(), at(27).getTime());
    assert.equal(moved.bookingStart?.getTime(), at(24).getTime(), 'the link itself is not moved');
    assert.equal((await gameRow(gD.id)).startTime.getTime(), at(24).getTime(), 'nor the game');
    assert.ok(moved.upstreamCheckedAt);
    assert.equal((await linkRow(gD2.id, 'gone')).upstreamState, 'MISSING');
    assert.equal((await linkRow(gD3.id, 'same')).upstreamState, 'OK');
    const far = await linkRow(gD4.id, 'far');
    assert.equal(far.upstreamState, 'OK', 'outside the synced range: untouched');
    assert.equal(far.upstreamCheckedAt, null);

    // The game payload carries the drift (additive).
    const detail = await GameReadService.getGameById(gD.id, owner.id);
    const detailLink = (detail as { linkedBookings: Array<Record<string, unknown>> }).linkedBookings[0];
    assert.equal(detailLink.upstreamState, 'MOVED');
    assert.equal(detailLink.upstreamStart, at(25).toISOString());

    // Client verify.
    let checked = await recordUpstreamCheck(gD2.id, (await linkRow(gD2.id, 'gone')).id, owner.id, false, { present: true, start: at(30).toISOString(), end: at(32).toISOString() });
    assert.equal(checked.upstreamState, 'OK', 'verify: present at the same time');
    checked = await recordUpstreamCheck(gD2.id, (await linkRow(gD2.id, 'gone')).id, owner.id, false, { present: false });
    assert.equal(checked.upstreamState, 'MISSING');
    await expectApiError(
      recordUpstreamCheck(gD2.id, (await linkRow(gD2.id, 'gone')).id, player.id, false, { present: true }),
      403,
      'players cannot verify',
    );

    /* --- accept-upstream ------------------------------------------------------------- */
    await expectApiError(
      acceptUpstreamDrift(gD2.id, (await linkRow(gD2.id, 'gone')).id, owner.id, false, { mode: 'keep_game' }),
      409,
      'MISSING cannot be accepted',
      'booking.upstream.notMoved',
    );
    // keep_game on a copy of the drift: link takes the club's times, game stays.
    const keep = await acceptUpstreamDrift(gD.id, moved.id, owner.id, false, { mode: 'keep_game' });
    assert.equal(keep.startTime, at(24).toISOString(), 'keep_game: game time kept');
    moved = await linkRow(gD.id, 'moved');
    assert.equal(moved.upstreamState, 'OK');
    assert.equal(moved.bookingStart?.getTime(), at(25).getTime(), 'link follows the club');
    assert.equal((await gameRow(gD.id)).bookingStatus, 'EXTERNAL_PARTIAL', 'coverage recomputed');
    assert.equal(await prisma.gameTimeChange.count({ where: { gameId: gD.id, noticeDueAt: { not: null } } }), 0, 'no time notice');

    // move_game: the club moves it again; the organizer follows with the game.
    await syncExternalBookingMirror(
      owner.id,
      externalBookingMirrorSyncBodySchema.parse({
        provider: 'BOOKTIME',
        clubId: club.id,
        rangeFrom: at(0).toISOString(),
        rangeTo: at(24 * 7).toISOString(),
        complete: false,
        bookings: [{ externalBookingId: bookingId('moved'), start: at(26).toISOString(), end: at(28).toISOString() }],
      }),
    );
    moved = await linkRow(gD.id, 'moved');
    assert.equal(moved.upstreamState, 'MOVED');
    const follow = await acceptUpstreamDrift(gD.id, moved.id, owner.id, false, { mode: 'move_game' });
    // Game 24–26 with booking 25–27 → booking 26–28: each edge shifts by 1 h.
    assert.equal(follow.startTime, at(25).toISOString());
    assert.equal(follow.endTime, at(27).toISOString());
    moved = await linkRow(gD.id, 'moved');
    assert.equal(moved.upstreamState, 'OK');
    assert.equal(moved.bookingStart?.getTime(), at(26).getTime());
    const tc = await prisma.gameTimeChange.findUniqueOrThrow({ where: { gameId: gD.id } });
    assert.ok(tc.noticeDueAt, 'move_game queues one time-change notice');
    assert.ok(tc.attendanceResetAt);
    const playerRow = await prisma.gameParticipant.findFirstOrThrow({ where: { gameId: gD.id, userId: player.id } });
    assert.equal(playerRow.attendance, 'UNANSWERED', 'attendance reset');
    await expectApiError(
      acceptUpstreamDrift(gD.id, moved.id, owner.id, false, { mode: 'move_game' }),
      409,
      'accepting twice',
      'booking.upstream.notMoved',
    );

    /* --- journal ------------------------------------------------------------------- */
    assert.equal(canTransitionStep('DONE', 'PENDING'), false);
    assert.equal(canTransitionStep('FAILED', 'RUNNING'), true);
    assert.equal(canTransitionStep('NEEDS_CLUB', 'RUNNING'), false);

    const gJ = await makeGame({ courtId: c4.id, startTime: at(48), endTime: at(50), multiCourt: true });
    await link(gJ.id, 'old', c4.id, at(48), at(50));
    const newStart = at(49);
    const newEnd = at(51);
    const plan = (to: Date) => ({
      gameId: gJ.id,
      steps: [
        { kind: 'book', idempotencyKey: `reschedule:${gJ.id}:gc:x:book_move:${to.getTime()}` },
        { kind: 'save_game', idempotencyKey: `reschedule:${gJ.id}:game:save_game:${to.getTime()}` },
        { kind: 'cancel', idempotencyKey: `reschedule:${gJ.id}:gc:x:cancel:old` },
        { kind: 'manual_club', idempotencyKey: `reschedule:${gJ.id}:gc:y:manual_club:reported`, reason: 'reported' },
      ],
    });
    const createBody = (to: Date) => ({
      plan: plan(to),
      fromStart: at(48).toISOString(),
      fromEnd: at(50).toISOString(),
      toStart: to.toISOString(),
      toEnd: new Date(to.getTime() + 2 * H).toISOString(),
    });
    await expectApiError(createReservationChange(gJ.id, player.id, false, createBody(newStart)), 403, 'players cannot start a run');
    const created = await createReservationChange(gJ.id, owner.id, false, createBody(newStart));
    assert.equal(created.resumed, false);
    const change = created.change;
    assert.deepEqual(change.steps.map((s) => [s.kind, s.status]), [
      ['book', 'PENDING'],
      ['save_game', 'PENDING'],
      ['cancel', 'PENDING'],
      ['manual_club', 'PENDING'],
    ], 'steps in plan order');
    const again = await createReservationChange(gJ.id, owner.id, false, createBody(newStart));
    assert.equal(again.resumed, true, 'same run re-posted → resumed');
    assert.equal(again.change.id, change.id);
    const running = await expectApiError(createReservationChange(gJ.id, owner.id, false, createBody(at(60))), 409, 'another run', 'reservationChange.running');
    assert.equal((running.data.active as { id: string }).id, change.id);
    assert.equal((await getActiveReservationChange(gJ.id, owner.id, false))?.id, change.id);

    const [bookKey, saveKey, cancelKey, manualKey] = change.steps.map((s) => s.idempotencyKey);
    let snap = await patchReservationChangeStep(change.id, bookKey, owner.id, false, { status: 'RUNNING' });
    snap = await patchReservationChangeStep(change.id, bookKey, owner.id, false, { status: 'DONE', result: { externalBookingId: bookingId('new') } });
    snap = await patchReservationChangeStep(change.id, bookKey, owner.id, false, { status: 'DONE', result: { other: true } });
    assert.deepEqual(snap.steps[0].result, { externalBookingId: bookingId('new') }, 'repeat DONE is a no-op');
    await expectApiError(patchReservationChangeStep(change.id, bookKey, owner.id, false, { status: 'PENDING' }), 409, 'DONE → PENDING', 'reservationChange.stepTransition');
    await expectApiError(patchReservationChangeStep(change.id, saveKey, owner.id, false, { status: 'DONE' }), 400, 'save_game only server-side', 'reservationChange.saveGameServerOnly');
    await expectApiError(patchReservationChangeStep(change.id, 'nope', owner.id, false, { status: 'DONE' }), 404, 'unknown step');
    await expectApiError(finishReservationChange(change.id, owner.id, false, { state: 'COMPLETED' }), 409, 'open steps', 'reservationChange.stepsOpen');

    // save-game that clashes: another game holds a reserved C1 at the new window.
    const gR = await makeGame({ courtId: c1.id, startTime: newStart, endTime: newEnd });
    await GameCourtService.setCourtSlots(gR.id, owner.id, { slots: [{ courtId: c1.id, reservation: 'REPORTED' }] });
    const slotsBefore = await prisma.gameCourt.findMany({ where: { gameId: gJ.id }, orderBy: { order: 'asc' } });
    await expectApiError(
      saveGameForReservationChange(change.id, owner.id, false, {
        startTime: newStart.toISOString(),
        endTime: newEnd.toISOString(),
        slotUpdates: { slots: [{ courtId: c4.id }, { courtId: c1.id }] },
        linksToRemove: [bookingId('old')],
        linksToAdd: [],
      }),
      409,
      'save-game clash',
      'court.clash',
    );
    let gJrow = await gameRow(gJ.id);
    assert.equal(gJrow.startTime.getTime(), at(48).getTime(), 'clash: time rolled back');
    assert.ok(await prisma.gameExternalBooking.findFirst({ where: { gameId: gJ.id, externalBookingId: bookingId('old') } }), 'clash: link kept');
    assert.deepEqual(
      (await prisma.gameCourt.findMany({ where: { gameId: gJ.id }, orderBy: { order: 'asc' } })).map((s) => s.courtId),
      slotsBefore.map((s) => s.courtId),
      'clash: slots rolled back',
    );
    assert.equal(await prisma.gameTimeChange.count({ where: { gameId: gJ.id } }), 0, 'clash: no time change recorded');
    let stepRow = await prisma.gameReservationChangeStep.findFirstOrThrow({ where: { changeId: change.id, idempotencyKey: saveKey } });
    assert.equal(stepRow.status, 'FAILED');
    assert.match(stepRow.error ?? '', /court\.clash/);

    // Retry with the real plan: time + links in one go (FAILED → DONE).
    const msgsBefore = await prisma.chatMessage.count({ where: { contextId: gJ.id, senderId: null } });
    const saveBody = {
      startTime: newStart.toISOString(),
      endTime: newEnd.toISOString(),
      linksToRemove: [bookingId('old')],
      linksToAdd: [
        {
          externalBookingId: bookingId('new'),
          snapshot: { externalBookingId: bookingId('new'), courtId: c4.id, bookingStart: newStart.toISOString(), bookingEnd: newEnd.toISOString() },
        },
      ],
    };
    const saved = await saveGameForReservationChange(change.id, owner.id, false, saveBody);
    assert.equal(saved.replayed, false);
    gJrow = await gameRow(gJ.id);
    assert.equal(gJrow.startTime.getTime(), newStart.getTime(), 'time saved');
    assert.equal(gJrow.bookingStatus, 'EXTERNAL_FULL', 'new booking covers the new window');
    const links = await prisma.gameExternalBooking.findMany({ where: { gameId: gJ.id } });
    assert.deepEqual(links.map((l) => l.externalBookingId), [bookingId('new')], 'old unlinked, new linked');
    const c4Slot = await prisma.gameCourt.findFirstOrThrow({ where: { gameId: gJ.id, courtId: c4.id } });
    assert.equal(links[0].gameCourtId, c4Slot.id, 'new link placed on its slot');
    stepRow = await prisma.gameReservationChangeStep.findFirstOrThrow({ where: { changeId: change.id, idempotencyKey: saveKey } });
    assert.equal(stepRow.status, 'DONE');
    assert.equal(stepRow.error, null);
    assert.deepEqual((stepRow.result as { addedLinkIds: string[] }).addedLinkIds, [links[0].id]);
    const tcJ = await prisma.gameTimeChange.findUniqueOrThrow({ where: { gameId: gJ.id } });
    assert.ok(tcJ.noticeDueAt, 'one time-change notice queued');
    assert.equal(
      (await prisma.gameParticipant.findFirstOrThrow({ where: { gameId: gJ.id, userId: player.id } })).attendance,
      'UNANSWERED',
      'attendance reset',
    );
    const msgsAfter = await prisma.chatMessage.count({ where: { contextId: gJ.id, senderId: null } });

    // Retry after DONE: replayed, nothing written.
    const replay = await saveGameForReservationChange(change.id, owner.id, false, saveBody);
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.result, stepRow.result);
    assert.equal(await prisma.gameExternalBooking.count({ where: { gameId: gJ.id } }), 1);
    assert.equal(await prisma.chatMessage.count({ where: { contextId: gJ.id, senderId: null } }), msgsAfter, 'replay posts nothing');
    assert.ok(msgsAfter > msgsBefore, 'the save posted its chat lines once');

    // Follow-ups: the manual step needs the club.
    await patchReservationChangeStep(change.id, cancelKey, owner.id, false, { status: 'SKIPPED' });
    await patchReservationChangeStep(change.id, manualKey, owner.id, false, { status: 'NEEDS_CLUB' });
    const finished = await finishReservationChange(change.id, owner.id, false, { state: 'COMPLETED' });
    assert.equal(finished.state, 'COMPLETED');
    assert.equal((await finishReservationChange(change.id, owner.id, false, { state: 'COMPLETED' })).state, 'COMPLETED', 'finish is idempotent');
    await expectApiError(finishReservationChange(change.id, owner.id, false, { state: 'FAILED' }), 409, 'other final state', 'reservationChange.finishConflict');
    await expectApiError(patchReservationChangeStep(change.id, bookKey, owner.id, false, { status: 'FAILED' }), 409, 'finished run', 'reservationChange.stepTransition');
    assert.equal(await getActiveReservationChange(gJ.id, owner.id, false), null);

    const ownerView = (await GameReadService.getGameById(gJ.id, owner.id)) as { pendingClubFollowUps?: Array<{ idempotencyKey: string; step: { reason?: string } | null }> };
    assert.equal(ownerView.pendingClubFollowUps?.length, 1, 'organizer sees the follow-up');
    assert.equal(ownerView.pendingClubFollowUps?.[0].idempotencyKey, manualKey);
    assert.equal(ownerView.pendingClubFollowUps?.[0].step?.reason, 'reported', 'with its plan step');
    assert.ok(!('pendingClubFollowUps' in projectGameForBroadcast(ownerView)), 'never broadcast');
    const playerView = (await GameReadService.getGameById(gJ.id, player.id)) as Record<string, unknown>;
    assert.ok(!('pendingClubFollowUps' in playerView), 'players do not see follow-ups');
    await patchReservationChangeStep(change.id, manualKey, owner.id, false, { status: 'DONE' });
    assert.ok(!('pendingClubFollowUps' in ((await GameReadService.getGameById(gJ.id, owner.id)) as object)), 'resolved → gone');

    /* --- stale-run takeover ------------------------------------------------------------ */
    const second = await createReservationChange(gJ.id, owner.id, false, createBody(at(60)));
    await expectApiError(createReservationChange(gJ.id, owner.id, false, createBody(at(70))), 409, 'fresh run blocks', 'reservationChange.running');
    await prisma.$executeRaw`UPDATE "GameReservationChange" SET "updatedAt" = ${new Date(Date.now() - 16 * MIN)} WHERE id = ${second.change.id}`;
    assert.equal((await getActiveReservationChange(gJ.id, owner.id, false))?.stale, true, 'stale flag');
    const third = await createReservationChange(gJ.id, owner.id, false, createBody(at(70)));
    assert.equal(third.abandonedId, second.change.id, 'stale run taken over');
    assert.equal((await prisma.gameReservationChange.findUniqueOrThrow({ where: { id: second.change.id } })).state, 'ABANDONED');
    await expectApiError(saveGameForReservationChange(second.change.id, owner.id, false, saveBody), 409, 'abandoned run cannot save', 'reservationChange.notRunning');

    console.log('reservationChanges.integration.test.ts: ok');
  } finally {
    await prisma.externalBookingMirror.deleteMany({ where: { userId: owner.id } }).catch(() => undefined);
    await prisma.externalBookingMirrorSync.deleteMany({ where: { userId: owner.id } }).catch(() => undefined);
    await prisma.chatMessage.deleteMany({ where: { contextId: { in: createdGameIds } } }).catch(() => undefined);
    await prisma.chatSyncEvent.deleteMany({ where: { contextId: { in: createdGameIds } } }).catch(() => undefined);
    await prisma.game.deleteMany({ where: { id: { in: createdGameIds } } }).catch(() => undefined);
    await prisma.club.deleteMany({ where: { id: club.id } }).catch(() => undefined);
    await prisma.userSportProfile.deleteMany({ where: { userId: { in: [owner.id, player.id] } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, player.id] } } }).catch(() => undefined);
    await prisma.city.deleteMany({ where: { id: city.id } }).catch(() => undefined);
    await prisma.$disconnect();
  }
})();
