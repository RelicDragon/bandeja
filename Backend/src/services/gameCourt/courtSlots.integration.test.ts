/**
 * Court slots against a real database (docs/domains/booking.md "Court slots").
 *
 * Proves:
 *   · PUT /games/:id/court-slots (GameCourtService.setCourtSlots): validation, order,
 *     REPORTED stamps, Game.courtId = first slot, legacy hasBookedCourt/bookingStatus,
 *     one booking-status chat notice per real change, refusing to drop a linked slot;
 *   · link placement: explicit gameCourtId, by court, appended slot for a new court;
 *   · extra courts: an unlink drops the empty court it added, an empty planned court is reused
 *     at the cap, the primary court follows the first slot, no new court above the cap;
 *   · old-app setGameCourts keeps reservations of courts that stay and re-places links;
 *   · `timePolicy=explicit` never moves the game's time (link / snapshots / unlink / PATCH);
 *   · old-app `hasBookedCourt` PATCH ↔ REPORTED slots / reportedAnyCourtCount;
 *   · EXTERNAL_FULL needs gap-free coverage per linked slot;
 *   · the migration backfill (run inside a rolled-back transaction).
 *
 * Safe against `padelpulse_dev`: rows are namespaced by a run suffix and removed in
 * `finally`; the backfill check never commits. Outbound notifications are suppressed.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { EntityType, GameType, ParticipantRole, ParticipantStatus, Sport } from '@prisma/client';
import prisma from '../../config/database';
import { GameCourtService, parseCourtSlotsBody } from './gameCourt.service';
import { GameUpdateService } from '../game/update.service';
import {
  linkBookingToGame,
  patchGameBookings,
  putGameBookingSnapshots,
} from '../game/gameExternalBooking.service';

process.env.E2E_TEST = '1';

const MIN = 60 * 1000;
const H = 60 * MIN;

async function expectApiError(promise: Promise<unknown>, status: number, label: string) {
  await assert.rejects(promise, (err: unknown) => {
    assert.equal((err as { statusCode?: number }).statusCode, status, label);
    return true;
  }, label);
}

void (async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const createdGameIds: string[] = [];
  const city = await prisma.city.create({
    data: { name: `Court slots ${suffix}`, country: 'Test', timezone: 'UTC' },
  });
  const owner = await prisma.user.create({
    data: { phone: `qa-courtslots-owner-${suffix}`, firstName: 'Owner', currentCityId: city.id, primarySport: Sport.PADEL },
  });
  const club = await prisma.club.create({
    data: { name: `Slots club ${suffix}`, normalizedName: `slots club ${suffix}`, address: 'x', cityId: city.id },
  });
  const otherClub = await prisma.club.create({
    data: { name: `Other club ${suffix}`, normalizedName: `other club ${suffix}`, address: 'x', cityId: city.id },
  });
  const [c1, c2, c3] = await Promise.all(
    ['C1', 'C2', 'C3'].map((name) => prisma.court.create({ data: { name, clubId: club.id, sport: Sport.PADEL } })),
  );
  const foreign = await prisma.court.create({ data: { name: 'F', clubId: otherClub.id, sport: Sport.PADEL } });

  const start = new Date(Math.ceil((Date.now() + 3 * 24 * H) / H) * H);
  const end = new Date(start.getTime() + 2 * H);

  const makeGame = async (over: { courtId?: string | null; maxParticipants?: number; hasBookedCourt?: boolean; clubId?: string | null } = {}) => {
    const game = await prisma.game.create({
      data: {
        entityType: EntityType.GAME,
        sport: Sport.PADEL,
        gameType: GameType.CLASSIC,
        cityId: city.id,
        clubId: over.clubId === undefined ? club.id : over.clubId,
        courtId: over.courtId ?? null,
        startTime: start,
        endTime: end,
        timeIsSet: true,
        maxParticipants: over.maxParticipants ?? 4,
        hasBookedCourt: over.hasBookedCourt ?? false,
        participants: {
          create: [{ userId: owner.id, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING }],
        },
      },
    });
    createdGameIds.push(game.id);
    return game;
  };
  const slotsOf = (gameId: string) =>
    prisma.gameCourt.findMany({ where: { gameId }, orderBy: { order: 'asc' } });
  const gameRow = (gameId: string) => prisma.game.findUniqueOrThrow({ where: { id: gameId } });
  const systemMessages = (gameId: string) =>
    prisma.chatMessage.count({ where: { contextId: gameId, senderId: null } });
  const bookingId = (name: string) => `qa-courtslots-${name}-${suffix}`;
  const link = (gameId: string, name: string, extra: Record<string, unknown> = {}, query: { timePolicy?: 'explicit' } = {}) =>
    linkBookingToGame(
      gameId,
      owner.id,
      false,
      {
        externalBookingId: bookingId(name),
        snapshot: {
          externalBookingId: bookingId(name),
          bookingStart: (extra.bookingStart as string) ?? start.toISOString(),
          bookingEnd: (extra.bookingEnd as string) ?? end.toISOString(),
          ...(extra.courtId ? { courtId: extra.courtId } : {}),
        },
        ...(extra.gameCourtId ? { gameCourtId: extra.gameCourtId } : {}),
      },
      query,
    );

  try {
    /* --- body validation --------------------------------------------------- */
    assert.throws(() => parseCourtSlotsBody({ slots: 'x' }));
    assert.throws(() => parseCourtSlotsBody({ slots: [{ courtId: 'a' }, { courtId: 'a' }] }), /Duplicate/);
    assert.throws(() => parseCourtSlotsBody({ slots: [{ courtId: 'a', reservation: 'MAYBE' }] }));
    assert.throws(() => parseCourtSlotsBody({ slots: Array.from({ length: 17 }, (_, i) => ({ courtId: `c${i}` })) }));
    assert.throws(() => parseCourtSlotsBody({ slots: [], reportedAnyCourtCount: -1 }));
    assert.throws(() => parseCourtSlotsBody({ slots: [], courtSlotCount: 0 }), /courtSlotCount/);
    assert.throws(() => parseCourtSlotsBody({ slots: [], courtSlotCount: 17 }), /courtSlotCount/);
    assert.throws(() => parseCourtSlotsBody({ slots: [], courtSlotCount: 1.5 }), /courtSlotCount/);
    assert.equal(parseCourtSlotsBody({ slots: [], courtSlotCount: null }).courtSlotCount, null);
    assert.equal(parseCourtSlotsBody({ slots: [], courtSlotCount: 3 }).courtSlotCount, 3);
    assert.deepEqual(parseCourtSlotsBody({ slots: [{ courtId: 'a' }] }), {
      slots: [{ courtId: 'a', reservation: 'NONE' }],
      reportedAnyCourtCount: 0,
    });

    /* --- PUT court-slots ---------------------------------------------------- */
    const g1 = await makeGame({ courtId: c1.id, maxParticipants: 8 });
    await prisma.gameCourt.create({ data: { gameId: g1.id, courtId: c1.id, order: 1 } });
    const msgs0 = await systemMessages(g1.id);

    let view = await GameCourtService.setCourtSlots(g1.id, owner.id, {
      slots: [
        { courtId: c1.id, reservation: 'REPORTED' },
        { courtId: c2.id, reservation: 'NONE' },
      ],
      reportedAnyCourtCount: 0,
    });
    assert.deepEqual(view.gameCourts.map((s) => [s.courtId, s.order, s.reservation]), [
      [c1.id, 1, 'REPORTED'],
      [c2.id, 2, 'NONE'],
    ]);
    assert.equal(view.gameCourts[0].reportedById, owner.id);
    assert.ok(view.gameCourts[0].reportedAt);
    assert.equal(view.gameCourts[1].reportedById, null);
    assert.equal(view.bookingStatus, 'MANUAL');
    assert.equal(view.hasBookedCourt, true);
    assert.equal(view.courtId, c1.id);
    assert.equal(await systemMessages(g1.id), msgs0 + 1, 'NONE → MANUAL posts one notice');
    const c1SlotId = view.gameCourts[0].id;

    // Same payload again: nothing changes, no notice, reportedAt kept.
    const reportedAt = view.gameCourts[0].reportedAt;
    view = await GameCourtService.setCourtSlots(g1.id, owner.id, {
      slots: [
        { courtId: c1.id, reservation: 'REPORTED' },
        { courtId: c2.id, reservation: 'NONE' },
      ],
    });
    assert.equal(view.gameCourts[0].id, c1SlotId, 'kept slot keeps its row');
    assert.equal(view.gameCourts[0].reportedAt?.getTime(), reportedAt?.getTime());
    assert.equal(await systemMessages(g1.id), msgs0 + 1, 'no status change, no notice');

    // Reorder + clear: courtId follows the first slot, reports are cleared.
    view = await GameCourtService.setCourtSlots(g1.id, owner.id, {
      slots: [
        { courtId: c2.id, reservation: 'NONE' },
        { courtId: c1.id, reservation: 'NONE' },
      ],
    });
    assert.deepEqual(view.gameCourts.map((s) => s.courtId), [c2.id, c1.id]);
    assert.equal(view.courtId, c2.id, 'Game.courtId = first slot');
    assert.equal(view.gameCourts[1].reportedById, null);
    assert.equal(view.gameCourts[1].reportedAt, null);
    assert.equal(view.bookingStatus, 'NONE');
    assert.equal(view.hasBookedCourt, false);
    assert.equal(await systemMessages(g1.id), msgs0 + 2, 'MANUAL → NONE posts one notice');

    // Club and sport checks.
    await expectApiError(
      GameCourtService.setCourtSlots(g1.id, owner.id, { slots: [{ courtId: foreign.id }] }),
      400,
      'court from another club',
    );
    await expectApiError(
      GameCourtService.setCourtSlots(g1.id, owner.id, { slots: [{ courtId: 'missing-court' }] }),
      404,
      'unknown court',
    );

    // No courts, one reported "any court".
    view = await GameCourtService.setCourtSlots(g1.id, owner.id, { slots: [], reportedAnyCourtCount: 1 });
    assert.equal(view.gameCourts.length, 0);
    assert.equal(view.courtId, null);
    assert.equal(view.reportedAnyCourtCount, 1);
    assert.equal(view.bookingStatus, 'MANUAL');

    /* --- courtSlotCount: the organizer decides how many courts ------------- */
    // 8-player rotation on one chosen court, linked → fully reserved (default rule).
    const gN = await makeGame({ courtId: c1.id, maxParticipants: 8 });
    view = await GameCourtService.setCourtSlots(gN.id, owner.id, { slots: [{ courtId: c1.id }] });
    assert.equal(view.courtSlotCount, null, 'default: no explicit count');
    await link(gN.id, 'slotcount', { courtId: c1.id });
    assert.equal((await gameRow(gN.id)).bookingStatus, 'EXTERNAL_FULL', '8 players, one chosen court, linked');
    // Explicit 2 → one any-court slot is still planned.
    view = await GameCourtService.setCourtSlots(gN.id, owner.id, { slots: [{ courtId: c1.id }], courtSlotCount: 2 });
    assert.equal(view.courtSlotCount, 2);
    assert.equal(view.bookingStatus, 'EXTERNAL_PARTIAL');
    // Absent → unchanged.
    view = await GameCourtService.setCourtSlots(gN.id, owner.id, { slots: [{ courtId: c1.id }] });
    assert.equal(view.courtSlotCount, 2, 'absent courtSlotCount leaves it unchanged');
    // null → back to the default rule.
    view = await GameCourtService.setCourtSlots(gN.id, owner.id, { slots: [{ courtId: c1.id }], courtSlotCount: null });
    assert.equal(view.courtSlotCount, null);
    assert.equal(view.bookingStatus, 'EXTERNAL_FULL');

    /* --- roster cap: never more courts than the roster needs ---------------- */
    const gCap = await makeGame({ courtId: c1.id, maxParticipants: 4 });
    await expectApiError(
      GameCourtService.setCourtSlots(gCap.id, owner.id, { slots: [{ courtId: c1.id }, { courtId: c2.id }] }),
      400,
      '4-player 2v2: a second court',
    );
    await expectApiError(
      GameCourtService.setCourtSlots(gCap.id, owner.id, { slots: [{ courtId: c1.id }], courtSlotCount: 2 }),
      400,
      '4-player 2v2: courtSlotCount 2',
    );
    view = await GameCourtService.setCourtSlots(gCap.id, owner.id, { slots: [{ courtId: c2.id }], courtSlotCount: 1 });
    assert.deepEqual(view.gameCourts.map((gc) => gc.courtId), [c2.id], 'switching the one court is fine');
    // A game already above the cap (older data) keeps its courts and may shrink.
    await prisma.gameCourt.create({ data: { gameId: gCap.id, courtId: c1.id, order: 99 } });
    view = await GameCourtService.setCourtSlots(gCap.id, owner.id, { slots: [{ courtId: c2.id }, { courtId: c1.id }] });
    assert.equal(view.gameCourts.length, 2, 'existing courts kept');
    view = await GameCourtService.setCourtSlots(gCap.id, owner.id, { slots: [{ courtId: c2.id }] });
    assert.equal(view.gameCourts.length, 1, 'shrink allowed');

    /* --- link placement ------------------------------------------------------ */
    const g2 = await makeGame({ courtId: c1.id, maxParticipants: 8 });
    view = await GameCourtService.setCourtSlots(g2.id, owner.id, {
      slots: [{ courtId: c1.id }, { courtId: c2.id }],
    });
    const [s1, s2] = view.gameCourts;

    let rows = await link(g2.id, 'b2', { courtId: c2.id });
    assert.equal(rows.find((r) => r.externalBookingId === bookingId('b2'))?.gameCourtId, s2.id, 'placed by court');
    assert.equal((await gameRow(g2.id)).bookingStatus, 'EXTERNAL_PARTIAL', 'court 1 not reserved yet');

    await expectApiError(link(g2.id, 'bad', { courtId: c2.id, gameCourtId: s1.id }), 400, 'slot/court mismatch');
    await expectApiError(link(g2.id, 'bad2', { gameCourtId: 'not-a-slot' }), 400, 'foreign slot');

    rows = await link(g2.id, 'b1', { courtId: c1.id, gameCourtId: s1.id });
    assert.equal(rows.find((r) => r.externalBookingId === bookingId('b1'))?.gameCourtId, s1.id, 'explicit slot');
    assert.equal((await gameRow(g2.id)).bookingStatus, 'EXTERNAL_FULL');

    rows = await link(g2.id, 'b3', { courtId: c3.id });
    let slots = await slotsOf(g2.id);
    assert.deepEqual(slots.map((s) => s.courtId), [c1.id, c2.id, c3.id], 'new court appended');
    assert.equal(rows.find((r) => r.externalBookingId === bookingId('b3'))?.gameCourtId, slots[2].id);

    await expectApiError(
      GameCourtService.setCourtSlots(g2.id, owner.id, { slots: [{ courtId: c1.id }, { courtId: c2.id }] }),
      400,
      'a linked slot is never dropped implicitly',
    );

    // Old app: setGameCourts drops C3 → its link stays, unplaced; C1 reservation survives.
    await prisma.gameCourt.update({ where: { id: s1.id }, data: { reservation: 'REPORTED' } });
    await GameCourtService.setGameCourts(g2.id, [c2.id, c1.id], { actorUserId: owner.id });
    slots = await slotsOf(g2.id);
    assert.deepEqual(slots.map((s) => [s.courtId, s.reservation]), [
      [c2.id, 'NONE'],
      [c1.id, 'REPORTED'],
    ]);
    assert.equal(slots[1].id, s1.id, 'kept row');
    assert.equal((await gameRow(g2.id)).courtId, c2.id, 'courtId follows first slot');
    const b3 = await prisma.gameExternalBooking.findFirstOrThrow({ where: { gameId: g2.id, externalBookingId: bookingId('b3') } });
    assert.equal(b3.gameCourtId, null, 'link of a removed court is unplaced, not deleted');
    const b2 = await prisma.gameExternalBooking.findFirstOrThrow({ where: { gameId: g2.id, externalBookingId: bookingId('b2') } });
    assert.equal(b2.gameCourtId, s2.id);

    // Snapshot moving a booking to another court re-places it (appending when needed).
    await putGameBookingSnapshots(g2.id, owner.id, false, {
      snapshots: [{ externalBookingId: bookingId('b3'), courtId: c3.id, bookingStart: start.toISOString(), bookingEnd: end.toISOString() }],
    });
    const b3After = await prisma.gameExternalBooking.findFirstOrThrow({ where: { gameId: g2.id, externalBookingId: bookingId('b3') } });
    slots = await slotsOf(g2.id);
    assert.equal(slots.at(-1)?.courtId, c3.id);
    assert.equal(b3After.gameCourtId, slots.at(-1)?.id);

    /* --- extra courts on a game that needs one (prod 2026-10-07) ---------------- */
    // 4-player game: in-app link on C1, then a second link on C2 (agent) appends a court.
    const gInc = await makeGame({ courtId: null, maxParticipants: 4 });
    await link(gInc.id, 'inc-1', { courtId: c1.id }, { timePolicy: 'explicit' });
    await linkBookingToGame(
      gInc.id,
      owner.id,
      false,
      {
        externalBookingId: bookingId('inc-2'),
        snapshot: { externalBookingId: bookingId('inc-2'), courtId: c2.id, bookingStart: start.toISOString(), bookingEnd: end.toISOString() },
        gamePatch: { courtId: c2.id },
      },
      { timePolicy: 'explicit' },
    );
    slots = await slotsOf(gInc.id);
    assert.deepEqual(slots.map((s) => s.courtId), [c1.id, c2.id], 'both linked courts are kept');
    assert.equal((await gameRow(gInc.id)).courtId, c1.id, 'primary court stays the first slot despite the link patch');
    // Removing one booking drops the court it added (no "1 of 2 booked").
    await patchGameBookings(gInc.id, owner.id, false, { remove: [bookingId('inc-1')] }, { timePolicy: 'explicit' });
    slots = await slotsOf(gInc.id);
    assert.deepEqual(slots.map((s) => s.courtId), [c2.id], 'empty extra court pruned');
    let incRow = await gameRow(gInc.id);
    assert.equal(incRow.courtId, c2.id, 'primary follows the remaining court');
    assert.equal(incRow.bookingStatus, 'EXTERNAL_FULL');

    // At the cap, a booking on another court takes over the empty planned court.
    const gReuse = await makeGame({ courtId: c1.id, maxParticipants: 4 });
    await GameCourtService.setCourtSlots(gReuse.id, owner.id, { slots: [{ courtId: c1.id }] });
    await link(gReuse.id, 'reuse-3', { courtId: c3.id }, { timePolicy: 'explicit' });
    slots = await slotsOf(gReuse.id);
    assert.deepEqual(slots.map((s) => s.courtId), [c3.id], 'empty planned court reused, not appended');
    incRow = await gameRow(gReuse.id);
    assert.equal(incRow.courtId, c3.id);
    assert.equal(incRow.bookingStatus, 'EXTERNAL_FULL');

    // Above the cap (older data) a game may keep its courts but not swap in a new one.
    const gOld = await makeGame({ courtId: c1.id, maxParticipants: 4 });
    await prisma.gameCourt.createMany({
      data: [
        { gameId: gOld.id, courtId: c1.id, order: 1 },
        { gameId: gOld.id, courtId: c2.id, order: 2 },
      ],
    });
    await expectApiError(
      GameCourtService.setCourtSlots(gOld.id, owner.id, { slots: [{ courtId: c1.id }, { courtId: c3.id }] }),
      400,
      'no new court above the cap',
    );

    // Reorder only accepts this game's own slots.
    const foreignSlots = await slotsOf(g2.id);
    await expectApiError(
      GameCourtService.reorderGameCourts(gOld.id, foreignSlots.slice(0, 2).map((s) => s.id)),
      400,
      'reorder with another game\'s slots',
    );

    /* --- gaps ------------------------------------------------------------------ */
    const g3 = await makeGame({ courtId: c1.id });
    await GameCourtService.setCourtSlots(g3.id, owner.id, { slots: [{ courtId: c1.id }] });
    await link(g3.id, 'gap-a', { courtId: c1.id, bookingStart: start.toISOString(), bookingEnd: new Date(start.getTime() + 45 * MIN).toISOString() }, { timePolicy: 'explicit' });
    await link(g3.id, 'gap-b', { courtId: c1.id, bookingStart: new Date(start.getTime() + H).toISOString(), bookingEnd: end.toISOString() }, { timePolicy: 'explicit' });
    assert.equal((await gameRow(g3.id)).bookingStatus, 'EXTERNAL_PARTIAL', '15 minute gap');
    await putGameBookingSnapshots(
      g3.id,
      owner.id,
      false,
      { snapshots: [{ externalBookingId: bookingId('gap-a'), courtId: c1.id, bookingStart: start.toISOString(), bookingEnd: new Date(start.getTime() + H).toISOString() }] },
      { timePolicy: 'explicit' },
    );
    assert.equal((await gameRow(g3.id)).bookingStatus, 'EXTERNAL_FULL', 'gap closed');

    /* --- timePolicy=explicit ---------------------------------------------------- */
    const g4 = await makeGame({ courtId: c1.id });
    const later = new Date(start.getTime() + 3 * H);
    const laterEnd = new Date(later.getTime() + 90 * MIN);
    await link(g4.id, 'tp1', { courtId: c1.id, bookingStart: later.toISOString(), bookingEnd: laterEnd.toISOString() }, { timePolicy: 'explicit' });
    let g4row = await gameRow(g4.id);
    assert.equal(g4row.startTime.getTime(), start.getTime(), 'explicit link keeps the time');
    assert.equal(g4row.endTime.getTime(), end.getTime());
    assert.equal(g4row.timeOverride, false, 'timeOverride is not persisted');
    assert.equal(g4row.bookingStatus, 'EXTERNAL_PARTIAL', 'booking does not cover the kept window');

    await putGameBookingSnapshots(
      g4.id,
      owner.id,
      false,
      { snapshots: [{ externalBookingId: bookingId('tp1'), courtId: c1.id, bookingStart: later.toISOString(), bookingEnd: new Date(laterEnd.getTime() + H).toISOString() }] },
      { timePolicy: 'explicit' },
    );
    assert.equal((await gameRow(g4.id)).startTime.getTime(), start.getTime(), 'explicit snapshot keeps the time');

    await GameUpdateService.updateGame(g4.id, { timeOverride: false }, owner.id, false, { timePolicy: 'explicit' });
    assert.equal((await gameRow(g4.id)).startTime.getTime(), start.getTime(), 'explicit PATCH keeps the time');

    await link(g4.id, 'tp2', { courtId: c1.id, bookingStart: start.toISOString(), bookingEnd: end.toISOString() }, { timePolicy: 'explicit' });
    await patchGameBookings(g4.id, owner.id, false, { remove: [bookingId('tp2')] }, { timePolicy: 'explicit' });
    assert.equal((await gameRow(g4.id)).startTime.getTime(), start.getTime(), 'explicit unlink keeps the time');

    // Legacy (no policy): the booking still drives the time.
    await putGameBookingSnapshots(g4.id, owner.id, false, {
      snapshots: [{ externalBookingId: bookingId('tp1'), courtId: c1.id, bookingStart: later.toISOString(), bookingEnd: laterEnd.toISOString() }],
    });
    g4row = await gameRow(g4.id);
    assert.equal(g4row.startTime.getTime(), later.getTime(), 'old apps: snapshot moves the time');
    assert.equal(g4row.bookingStatus, 'EXTERNAL_FULL');

    /* --- legacy hasBookedCourt compat ------------------------------------------- */
    const g5 = await makeGame({ courtId: c1.id });
    // Two courts on a 4-player game: older data (the court-slots editor now caps at the roster need).
    await prisma.gameCourt.createMany({
      data: [
        { gameId: g5.id, courtId: c1.id, order: 0 },
        { gameId: g5.id, courtId: c2.id, order: 1 },
      ],
    });
    const msgs5 = await systemMessages(g5.id);
    await GameUpdateService.updateGame(g5.id, { hasBookedCourt: true }, owner.id, false);
    slots = await slotsOf(g5.id);
    assert.deepEqual(slots.map((s) => s.reservation), ['REPORTED', 'REPORTED'], 'true → all slots reported');
    assert.equal(slots[0].reportedById, owner.id);
    let g5row = await gameRow(g5.id);
    assert.equal(g5row.bookingStatus, 'MANUAL');
    assert.equal(g5row.hasBookedCourt, true);
    assert.equal(await systemMessages(g5.id), msgs5 + 1);

    // Re-sending true is a no-op; old app adding a court inherits REPORTED.
    await GameUpdateService.updateGame(g5.id, { hasBookedCourt: true }, owner.id, false);
    await GameCourtService.setGameCourts(g5.id, [c1.id, c2.id, c3.id], { actorUserId: owner.id });
    slots = await slotsOf(g5.id);
    assert.deepEqual(slots.map((s) => s.reservation), ['REPORTED', 'REPORTED', 'REPORTED']);

    await GameUpdateService.updateGame(g5.id, { hasBookedCourt: false }, owner.id, false);
    slots = await slotsOf(g5.id);
    assert.deepEqual(slots.map((s) => s.reservation), ['NONE', 'NONE', 'NONE'], 'false → reports cleared');
    assert.equal(slots[0].reportedById, null);
    g5row = await gameRow(g5.id);
    assert.equal(g5row.bookingStatus, 'NONE');
    assert.equal(g5row.hasBookedCourt, false);

    // No courts at all → reportedAnyCourtCount.
    const g6 = await makeGame({ courtId: null });
    await GameUpdateService.updateGame(g6.id, { hasBookedCourt: true }, owner.id, false);
    let g6row = await gameRow(g6.id);
    assert.equal(g6row.reportedAnyCourtCount, 1);
    assert.equal(g6row.bookingStatus, 'MANUAL');
    await GameUpdateService.updateGame(g6.id, { hasBookedCourt: false }, owner.id, false);
    g6row = await gameRow(g6.id);
    assert.equal(g6row.reportedAnyCourtCount, 0);
    assert.equal(g6row.bookingStatus, 'NONE');

    // Old rule stays: cannot clear while links exist.
    await expectApiError(GameUpdateService.updateGame(g4.id, { hasBookedCourt: false }, owner.id, false), 400, 'links block clearing');

    // A PATCH that only moves the primary court moves a single unlinked slot with it.
    const g7 = await makeGame({ courtId: c1.id, hasBookedCourt: true });
    await GameUpdateService.updateGame(g7.id, { maxParticipants: 4 }, owner.id, false);
    slots = await slotsOf(g7.id);
    assert.deepEqual(slots.map((s) => [s.courtId, s.reservation]), [[c1.id, 'REPORTED']], 'lazy: primary slot created and reported');
    await GameUpdateService.updateGame(g7.id, { courtId: c2.id }, owner.id, false);
    slots = await slotsOf(g7.id);
    assert.deepEqual(slots.map((s) => [s.courtId, s.reservation]), [[c2.id, 'REPORTED']]);

    /* --- migration backfill (rolled back) ---------------------------------------- */
    const migrationSql = fs.readFileSync(
      path.join(__dirname, '../../../prisma/backfills/20261005220000_game_court_slots.sql'),
      'utf8',
    );
    const backfill = migrationSql
      .slice(migrationSql.indexOf('-- Backfill'))
      .split(/;\s*\n/)
      .map((stmt) => stmt.replace(/^\s*--.*$/gm, '').trim())
      .filter(Boolean);
    assert.ok(backfill.length >= 5, 'backfill statements found');
    const ROLLBACK = new Error('rollback');
    await prisma
      .$transaction(
        async (tx) => {
          const mk = (data: { courtId: string | null; hasBookedCourt: boolean }) =>
            tx.game.create({
              data: {
                entityType: EntityType.GAME,
                sport: Sport.PADEL,
                gameType: GameType.CLASSIC,
                cityId: city.id,
                clubId: club.id,
                startTime: start,
                endTime: end,
                ...data,
              },
            });
          const noSlot = await mk({ courtId: c1.id, hasBookedCourt: true });
          const drifted = await mk({ courtId: c2.id, hasBookedCourt: false });
          await tx.gameCourt.create({ data: { gameId: drifted.id, courtId: c1.id, order: 1 } });
          await tx.gameExternalBooking.create({
            data: { gameId: drifted.id, externalBookingId: bookingId('bf-1'), courtId: c1.id },
          });
          await tx.gameExternalBooking.create({
            data: { gameId: drifted.id, externalBookingId: bookingId('bf-3'), courtId: c3.id },
          });
          const manualNoCourt = await mk({ courtId: null, hasBookedCourt: true });
          const linkedBooked = await mk({ courtId: c1.id, hasBookedCourt: true });
          await tx.gameExternalBooking.create({
            data: { gameId: linkedBooked.id, externalBookingId: bookingId('bf-l'), courtId: c1.id },
          });

          for (let pass = 0; pass < 2; pass++) {
            for (const stmt of backfill) await tx.$executeRawUnsafe(stmt);
          }

          const slotsIn = (gameId: string) =>
            tx.gameCourt.findMany({ where: { gameId }, orderBy: { order: 'asc' } });
          let s = await slotsIn(noSlot.id);
          assert.deepEqual(s.map((r) => [r.courtId, r.order, r.reservation]), [[c1.id, 1, 'REPORTED']], 'a + c');
          s = await slotsIn(drifted.id);
          assert.deepEqual(s.map((r) => [r.courtId, r.order]), [[c1.id, 1], [c2.id, 2], [c3.id, 3]], 'a + a2, idempotent');
          const links = await tx.gameExternalBooking.findMany({ where: { gameId: drifted.id } });
          for (const row of links) {
            assert.equal(row.gameCourtId, s.find((slot) => slot.courtId === row.courtId)?.id, 'b: placed by court');
          }
          assert.equal((await tx.game.findUniqueOrThrow({ where: { id: manualNoCourt.id } })).reportedAnyCourtCount, 1, 'c: no slot');
          s = await slotsIn(linkedBooked.id);
          assert.deepEqual(s.map((r) => r.reservation), ['NONE'], 'linked games are not reported');
          assert.equal((await tx.game.findUniqueOrThrow({ where: { id: linkedBooked.id } })).reportedAnyCourtCount, 0);
          throw ROLLBACK;
        },
        { timeout: 120_000, maxWait: 20_000 },
      )
      .catch((err) => {
        if (err !== ROLLBACK) throw err;
      });

    console.log('courtSlots.integration.test.ts: ok');
  } finally {
    await prisma.chatMessage.deleteMany({ where: { contextId: { in: createdGameIds } } }).catch(() => undefined);
    await prisma.chatSyncEvent.deleteMany({ where: { contextId: { in: createdGameIds } } }).catch(() => undefined);
    await prisma.game.deleteMany({ where: { id: { in: createdGameIds } } }).catch(() => undefined);
    await prisma.court.deleteMany({ where: { clubId: { in: [club.id, otherClub.id] } } }).catch(() => undefined);
    await prisma.club.deleteMany({ where: { id: { in: [club.id, otherClub.id] } } }).catch(() => undefined);
    await prisma.userSportProfile.deleteMany({ where: { userId: owner.id } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: owner.id } }).catch(() => undefined);
    await prisma.city.deleteMany({ where: { id: city.id } }).catch(() => undefined);
    await prisma.$disconnect();
  }
})();
