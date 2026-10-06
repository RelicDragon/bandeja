/**
 * Club admin console — permission holes and club-local day windows (docs/domains/club-admin.md).
 *
 * Proves, over HTTP against a real database:
 *   · courts: club A's admin cannot touch club B's courts, move a court, change its integration
 *     mapping or hard-delete it; platform admins can;
 *   · holds: validated (label, instants, order, 24 h, past, inactive / foreign court) and
 *     club-scoped for PATCH/DELETE;
 *   · games: "belongs to club" predicate for cancel/clear, fixtures locked, results locked,
 *     clear releases the club's court slots and links through the shared update path;
 *   · schedule: club-local day window (not the server's UTC day), 400 on a bad date;
 *   · list: bookingsToday on the club's local day; patchClub typed and renames normalise.
 */
import assert from 'node:assert/strict';
import { EntityType } from '@prisma/client';
import { clubLocalDate, clubWallTimeToUtc } from '@bandeja/shared/clubAdmin/clubTime';
import prisma from '../../../config/database';
import { createFixtures, expectStatus, H, startServer } from './clubAdminHarness';

void (async () => {
  const api = await startServer();
  const f = await createFixtures('sec', { timezoneA: 'Pacific/Auckland', timezoneB: 'UTC' });
  const { clubA, clubB, a1, a2, b1, adminA, adminB, platform } = f;
  const future = (hours: number) => new Date(Math.ceil((Date.now() + 3 * 24 * H) / H) * H + hours * H);

  try {
    /* --- courts (legacy /courts) ------------------------------------------------------- */
    expectStatus(await api.call(adminA.id, 'PUT', `/courts/${a1.id}`, { clubId: clubB.id }), 403, 'move court to another club');
    expectStatus(await api.call(adminA.id, 'PUT', `/courts/${a1.id}`, { externalCourtId: 'x' }), 403, 'integration mapping');
    expectStatus(await api.call(adminA.id, 'PUT', `/courts/${b1.id}`, { name: 'Mine now' }), 403, 'foreign court');
    expectStatus(await api.call(adminA.id, 'PUT', `/courts/${a1.id}`, { name: 'A1 renamed', id: 'evil' }), 200, 'own court');
    assert.equal((await prisma.court.findUniqueOrThrow({ where: { id: a1.id } })).name, 'A1 renamed');
    expectStatus(await api.call(adminA.id, 'DELETE', `/courts/${a1.id}`), 403, 'club admin cannot hard-delete');
    expectStatus(await api.call(adminA.id, 'POST', '/courts', { name: 'X', clubId: clubB.id }), 403, 'create in foreign club');
    expectStatus(await api.call(platform.id, 'PUT', `/courts/${a1.id}`, { externalCourtId: 'ext-1' }), 200, 'platform admin maps');
    expectStatus(await api.call(adminA.id, 'PATCH', `/club-admin/courts/${b1.id}`, { name: 'x' }), 403, 'legacy court patch foreign');

    /* --- holds --------------------------------------------------------------------------- */
    const hold = (body: Record<string, unknown>) =>
      api.call(adminA.id, 'POST', `/club-admin/clubs/${clubA.id}/holds`, {
        courtId: a1.id,
        startTime: future(1).toISOString(),
        endTime: future(2).toISOString(),
        label: 'WALK_IN',
        ...body,
      });
    expectStatus(await hold({ courtId: b1.id }), 404, 'hold on foreign court', 'clubAdmin.notFound');
    expectStatus(await hold({ label: 'PARTY' }), 400, 'bad label', 'clubAdmin.validation');
    expectStatus(await hold({ startTime: 'tomorrow' }), 400, 'bad instant', 'clubAdmin.validation');
    expectStatus(await hold({ endTime: future(1).toISOString() }), 400, 'end <= start', 'clubAdmin.validation');
    expectStatus(await hold({ endTime: future(26).toISOString() }), 400, '> 24 h', 'clubAdmin.validation');
    expectStatus(
      await hold({ startTime: new Date(Date.now() - 3 * H).toISOString(), endTime: new Date(Date.now() - 2 * H).toISOString() }),
      400,
      'past',
      'clubAdmin.holdInPast'
    );
    await prisma.court.update({ where: { id: a2.id }, data: { isActive: false } });
    expectStatus(await hold({ courtId: a2.id }), 400, 'inactive court', 'clubAdmin.courtInactive');
    await prisma.court.update({ where: { id: a2.id }, data: { isActive: true } });
    const created = await hold({});
    expectStatus(created, 201, 'valid hold');
    const holdId = (created.body.data?.id ?? created.body.data?.holdIds?.[0]) as string;
    assert.ok(holdId, 'hold id returned');
    expectStatus(await api.call(adminB.id, 'PATCH', `/club-admin/holds/${holdId}`, { note: 'x' }), 403, 'foreign hold patch');
    expectStatus(await api.call(adminB.id, 'DELETE', `/club-admin/holds/${holdId}`), 403, 'foreign hold delete');
    expectStatus(await api.call(adminA.id, 'PATCH', `/club-admin/holds/${holdId}`, { courtId: b1.id }), 404, 'move hold to foreign court');
    expectStatus(await api.call(adminA.id, 'PATCH', `/club-admin/holds/${holdId}`, { note: 'ok' }), 200, 'own hold patch');

    /* --- games: predicate, cancel, clear ---------------------------------------------- */
    const gB = await f.makeGame({ clubId: clubB.id, courtId: b1.id, cityId: f.cityB.id, startTime: future(3), endTime: future(4) });
    const body = { reason: 'maintenance', notifyHost: false };
    expectStatus(await api.call(adminA.id, 'POST', `/club-admin/clubs/${clubA.id}/games/${gB.id}/cancel`, body), 404, 'foreign game cancel', 'clubAdmin.notFound');
    expectStatus(await api.call(adminA.id, 'POST', `/club-admin/clubs/${clubA.id}/games/${gB.id}/clear-court`, body), 404, 'foreign game clear', 'clubAdmin.notFound');
    expectStatus(await api.call(adminA.id, 'POST', `/club-admin/clubs/${clubB.id}/games/${gB.id}/cancel`, body), 403, 'not admin of B', 'clubAdmin.forbidden');

    // Club B game whose second court slot is at club A: A sees it through the slot.
    const gSlot = await f.makeGame({ clubId: clubB.id, courtId: b1.id, cityId: f.cityB.id, startTime: future(5), endTime: future(6) });
    await prisma.gameCourt.create({ data: { gameId: gSlot.id, courtId: a1.id, order: 2 } });
    expectStatus(await api.call(adminA.id, 'POST', `/club-admin/clubs/${clubA.id}/games/${gSlot.id}/clear-court`, body), 200, 'slot at A → clearable by A');
    const slotsAfter = await prisma.gameCourt.findMany({ where: { gameId: gSlot.id }, select: { courtId: true } });
    assert.deepEqual(slotsAfter.map((s) => s.courtId), [b1.id], "clear drops only A's slot");

    const league = await f.makeGame({ courtId: a1.id, startTime: future(7), endTime: future(8), entityType: EntityType.LEAGUE });
    expectStatus(await api.call(adminA.id, 'POST', `/club-admin/clubs/${clubA.id}/games/${league.id}/cancel`, body), 400, 'fixture', 'clubAdmin.entityTypeLocked');
    const scored = await f.makeGame({ courtId: a1.id, startTime: future(9), endTime: future(10) });
    await prisma.game.update({ where: { id: scored.id }, data: { resultsStatus: 'IN_PROGRESS' } });
    expectStatus(await api.call(adminA.id, 'POST', `/club-admin/clubs/${clubA.id}/games/${scored.id}/cancel`, body), 400, 'results', 'clubAdmin.resultsEntered');

    // Clear: club-scoped update path, reported slot + link released, upstream untouched.
    const gClear = await f.makeGame({ courtId: a1.id, startTime: future(11), endTime: future(12) });
    await prisma.gameCourt.updateMany({ where: { gameId: gClear.id }, data: { reservation: 'REPORTED', reportedById: f.owner.id, reportedAt: new Date() } });
    await prisma.gameExternalBooking.create({
      data: { gameId: gClear.id, externalBookingId: `qa-ca-${f.suffix}`, courtId: a1.id, bookingStart: future(11), bookingEnd: future(12) },
    });
    expectStatus(await api.call(adminA.id, 'POST', `/club-admin/clubs/${clubA.id}/games/${gClear.id}/clear-court`, body), 200, 'clear own game');
    const cleared = await prisma.game.findUniqueOrThrow({
      where: { id: gClear.id },
      include: { gameCourts: true, externalBookings: true, participants: true },
    });
    assert.equal(cleared.courtId, null, 'primary court released');
    assert.equal(cleared.timeIsSet, false, 'time released');
    assert.equal(cleared.hasBookedCourt, false, 'not booked');
    assert.equal(cleared.gameCourts.length, 0, 'slots released');
    assert.equal(cleared.externalBookings.length, 0, 'link removed (provider booking untouched)');
    assert.equal(cleared.participants.length, 1, 'roster untouched');

    const gCancel = await f.makeGame({ courtId: a1.id, startTime: future(13), endTime: future(14) });
    expectStatus(await api.call(adminA.id, 'POST', `/club-admin/clubs/${clubA.id}/games/${gCancel.id}/cancel`, body), 200, 'cancel own game');
    assert.equal(await prisma.game.count({ where: { id: gCancel.id } }), 0, 'deleted');

    /* --- schedule: club-local day ------------------------------------------------------- */
    expectStatus(await api.call(adminA.id, 'GET', `/club-admin/clubs/${clubA.id}/schedule?date=2026-13-01`), 400, 'bad date', 'clubAdmin.validation');
    const tz = f.cityA.timezone;
    const day = clubLocalDate(future(48), tz);
    const lateStart = clubWallTimeToUtc(day, 22 * 60 + 30, tz); // 22:30 local
    const nextMorning = clubWallTimeToUtc(day, 24 * 60 + 30, tz); // 00:30 local next day
    const gLate = await f.makeGame({ courtId: a2.id, startTime: lateStart, endTime: new Date(lateStart.getTime() + H) });
    const gNext = await f.makeGame({ courtId: a2.id, startTime: nextMorning, endTime: new Date(nextMorning.getTime() + H) });
    const sched = await api.call(adminA.id, 'GET', `/club-admin/clubs/${clubA.id}/schedule?date=${day}`);
    expectStatus(sched, 200, 'schedule');
    const ids = new Set((sched.body.data.slots as Array<{ gameId?: string }>).map((s) => s.gameId));
    assert.ok(ids.has(gLate.id), 'late-evening game on its local day');
    assert.ok(!ids.has(gNext.id), 'next local morning is not this day (UTC-day bug)');
    assert.equal(sched.body.data.date, day);
    assert.equal(sched.body.data.timezone, tz);
    const today = await api.call(adminA.id, 'GET', `/club-admin/clubs/${clubA.id}/schedule`);
    assert.equal(today.body.data.date, clubLocalDate(new Date(), tz), 'default date is club-local today');

    /* --- list: bookingsToday --------------------------------------------------------------- */
    const now = Date.now();
    const todayGame = await f.makeGame({ courtId: a1.id, startTime: new Date(now - 5 * 60_000), endTime: new Date(now + 55 * 60_000) });
    const list = await api.call(adminA.id, 'GET', '/club-admin/clubs?limit=x');
    expectStatus(list, 400, 'NaN limit', 'clubAdmin.validation');
    const list2 = await api.call(adminA.id, 'GET', '/club-admin/clubs');
    const rowA = (list2.body.data.items as Array<{ id: string; bookingsToday: number }>).find((c) => c.id === clubA.id);
    assert.ok(rowA && rowA.bookingsToday >= 1, `bookingsToday counts ${todayGame.id}`);

    /* --- patchClub ------------------------------------------------------------------------- */
    expectStatus(await api.call(adminA.id, 'PATCH', `/club-admin/clubs/${clubA.id}`, { latitude: 'north' }), 400, 'lat type', 'clubAdmin.validation');
    expectStatus(await api.call(adminA.id, 'PATCH', `/club-admin/clubs/${clubA.id}`, { photos: 'x' }), 400, 'photos type', 'clubAdmin.validation');
    expectStatus(await api.call(adminA.id, 'PATCH', `/club-admin/clubs/${clubA.id}`, { photos: ['https://evil/x.jpg'] }), 400, 'foreign photo', 'clubAdmin.validation');
    expectStatus(await api.call(adminA.id, 'PATCH', `/club-admin/clubs/${clubA.id}`, { sports: ['CHESS'] }), 400, 'sports', 'clubAdmin.validation');
    expectStatus(await api.call(adminA.id, 'PATCH', `/club-admin/clubs/${clubA.id}`, { name: 'Ćlub Ä renamed' }), 200, 'rename');
    assert.equal((await prisma.club.findUniqueOrThrow({ where: { id: clubA.id } })).normalizedName, 'club a renamed');

    console.log('clubAdminSecurity.integration.test.ts: ok');
  } finally {
    await f.cleanup();
    await api.close();
    await prisma.$disconnect();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
