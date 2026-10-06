/**
 * Club admin console v2 over HTTP against a real database (docs/domains/club-admin.md):
 *   · capabilities: STAFF can run the desk but not edit the club, courts, hours or team —
 *     on v2 and legacy routes alike;
 *   · hours: PUT/GET round trip, past-midnight window on the schedule;
 *   · holds: overlap 409 with details (opt-in `detectOverlap`), force, weekly repeat skipping
 *     clashes, series delete, legacy create/PATCH stay overlap-free;
 *   · bookings: keyset pages are complete, ordered and duplicate-free in both scopes; filters;
 *   · team: last-admin guard, duplicate member;
 *   · courts reorder/impact, profile, context, dashboard, activity rows.
 */
import assert from 'node:assert/strict';
import { addDaysToDate, clubLocalDate, clubWallTimeToUtc, isoWeekdayOfDate } from '@bandeja/shared/clubAdmin/clubTime';
import prisma from '../../../config/database';
import { createFixtures, expectStatus, H, startServer } from './clubAdminHarness';

void (async () => {
  const api = await startServer();
  const f = await createFixtures('console', { timezoneA: 'Europe/Belgrade' });
  const { clubA, a1, a2, adminA, staffA, stranger } = f;
  const tz = f.cityA.timezone;
  const base = `/club-admin/clubs/${clubA.id}`;
  const hourAt = (h: number) => new Date(Math.ceil((Date.now() + 2 * 24 * H) / H) * H + h * H);

  try {
    /* --- capabilities ----------------------------------------------------------------------- */
    const ctx = await api.call(staffA.id, 'GET', `${base}/context`);
    expectStatus(ctx, 200, 'staff context');
    assert.equal(ctx.body.data.role, 'STAFF');
    assert.deepEqual(ctx.body.data.capabilities, ['schedule.view', 'schedule.edit', 'bookings.view', 'billing.collect']);
    assert.equal(ctx.body.data.today, clubLocalDate(new Date(), tz));
    assert.equal(ctx.body.data.club.timezone, tz);
    const denied: Array<[string, string, unknown?]> = [
      ['PATCH', base, { phone: '1' }],
      ['PATCH', `${base}/profile`, { phone: '1' }],
      ['PUT', `${base}/hours`, {}],
      ['GET', `${base}/team`],
      ['POST', `${base}/courts`, { name: 'S' }],
      ['POST', `${base}/courts/reorder`, { courtIds: [] }],
      ['PATCH', `${base}/courts/${a1.id}`, { name: 'S' }],
      ['PATCH', `/club-admin/courts/${a1.id}`, { name: 'S' }],
      ['PATCH', `/club-admin/courts/${a1.id}/deactivate`],
    ];
    for (const [method, path, payload] of denied) {
      expectStatus(await api.call(staffA.id, method, path, payload), 403, `staff ${method} ${path}`, 'clubAdmin.capability');
    }
    for (const path of [`${base}/schedule`, `${base}/reservations`, `${base}/bookings`, `${base}/dashboard`, `${base}/courts`, base]) {
      expectStatus(await api.call(staffA.id, 'GET', path), 200, `staff GET ${path}`);
    }
    expectStatus(await api.call(stranger.id, 'GET', `${base}/context`), 403, 'stranger', 'clubAdmin.forbidden');
    await prisma.club.update({ where: { id: clubA.id }, data: { integrationConfig: { secret: 'x' } } });
    assert.equal((await api.call(staffA.id, 'GET', base)).body.data.integrationConfig, null, 'staff never sees provider config');
    assert.deepEqual((await api.call(adminA.id, 'GET', base)).body.data.integrationConfig, { secret: 'x' });

    /* --- hours ----------------------------------------------------------------------------- */
    const weekly = ([1, 2, 3, 4, 5, 6, 7] as const).map((weekday) => ({
      weekday,
      closed: weekday === 7,
      open: '08:00',
      close: weekday === 6 ? '01:00' : '22:00',
    }));
    const futureDate = addDaysToDate(clubLocalDate(new Date(), tz), 10);
    const put = await api.call(adminA.id, 'PUT', `${base}/hours`, {
      weekly,
      closures: [{ date: futureDate, open: null, close: null, note: 'Holiday' }],
    });
    expectStatus(put, 200, 'put hours');
    assert.equal(put.body.data.configured, true);
    assert.equal(put.body.data.closures.length, 1);
    const clubRow = await prisma.club.findUniqueOrThrow({ where: { id: clubA.id } });
    assert.deepEqual([clubRow.openingTime, clubRow.closingTime], ['08:00', '22:00'], 'legacy mirror = Monday');
    let saturday = addDaysToDate(clubLocalDate(new Date(), tz), 1);
    while (isoWeekdayOfDate(saturday) !== 6) saturday = addDaysToDate(saturday, 1);
    const satSched = await api.call(adminA.id, 'GET', `${base}/schedule?date=${saturday}`);
    expectStatus(satSched, 200, 'saturday schedule');
    assert.equal(satSched.body.data.hours.open, '08:00');
    assert.equal(satSched.body.data.hours.closeAt, clubWallTimeToUtc(saturday, 25 * 60, tz).toISOString(), '01:00 next day');
    assert.equal((await api.call(adminA.id, 'GET', `${base}/schedule?date=${futureDate}`)).body.data.hours, null, 'closure');
    assert.ok(Array.isArray(satSched.body.data.courts) && satSched.body.data.slotMinutes > 0, 'additive schedule fields');

    /* --- holds: overlap, force, repeat, series delete ---------------------------------------- */
    const h1 = await api.call(adminA.id, 'POST', `${base}/holds`, {
      courtId: a1.id,
      startTime: hourAt(1).toISOString(),
      endTime: hourAt(2).toISOString(),
      label: 'PHONE',
      customerName: 'Ana',
      customerPhone: '+381 1',
    });
    expectStatus(h1, 201, 'hold 1');
    assert.equal(h1.body.data.id, h1.body.data.holdIds[0], 'legacy row + v2 fields');
    const clash = await api.call(adminA.id, 'POST', `${base}/holds`, {
      courtId: a1.id,
      startTime: new Date(hourAt(1).getTime() + 30 * 60_000).toISOString(),
      endTime: hourAt(3).toISOString(),
      label: 'WALK_IN',
      detectOverlap: true,
    });
    expectStatus(clash, 409, 'overlap', 'clubAdmin.holdOverlap');
    const overlaps = (clash.body.details as { overlaps: Array<{ kind: string; id: string }> }).overlaps;
    assert.deepEqual(overlaps.map((o) => [o.kind, o.id]), [['hold', h1.body.data.id]]);
    const forced = await api.call(adminA.id, 'POST', `${base}/holds`, {
      courtId: a1.id,
      startTime: hourAt(1).toISOString(),
      endTime: hourAt(2).toISOString(),
      label: 'WALK_IN',
      detectOverlap: true,
      force: true,
    });
    expectStatus(forced, 201, 'force');
    // Store builds share this path, never send detectOverlap and swallow errors: always create.
    const legacyOver = await api.call(adminA.id, 'POST', `${base}/holds`, {
      courtId: a1.id,
      startTime: hourAt(1).toISOString(),
      endTime: hourAt(2).toISOString(),
      label: 'PHONE',
    });
    expectStatus(legacyOver, 201, 'legacy create over an overlap');
    assert.deepEqual(legacyOver.body.data.skipped, []);

    // Weekly x3 on a2; week 2 clashes with a game → skipped.
    const g2 = await f.makeGame({ courtId: a2.id, startTime: new Date(hourAt(5).getTime() + 7 * 24 * H), endTime: new Date(hourAt(6).getTime() + 7 * 24 * H) });
    const series = await api.call(adminA.id, 'POST', `${base}/holds`, {
      courtId: a2.id,
      startTime: hourAt(5).toISOString(),
      endTime: hourAt(6).toISOString(),
      label: 'ACADEMY',
      repeatWeeks: 3,
      detectOverlap: true,
    });
    expectStatus(series, 201, 'series');
    assert.equal(series.body.data.holdIds.length, 2, 'one occurrence skipped');
    assert.equal(series.body.data.skipped.length, 1);
    assert.ok(series.body.data.seriesId, 'series id');
    expectStatus(
      await api.call(adminA.id, 'POST', `${base}/holds`, { courtId: a2.id, startTime: g2.startTime.toISOString(), endTime: g2.endTime.toISOString(), label: 'OTHER', detectOverlap: true }),
      409,
      'game overlap',
      'clubAdmin.holdOverlap'
    );
    expectStatus(await api.call(adminA.id, 'POST', `${base}/holds`, { courtId: a2.id, startTime: hourAt(5).toISOString(), endTime: hourAt(6).toISOString(), label: 'OTHER', repeatWeeks: 27 }), 400, 'repeat max', 'clubAdmin.validation');

    // v2 PATCH checks overlaps when asked; the legacy path never does.
    const [s1, s2] = series.body.data.holdIds as string[];
    const movePatch = { courtId: a2.id, startTime: hourAt(5).toISOString(), endTime: hourAt(6).toISOString() };
    expectStatus(
      await api.call(adminA.id, 'PATCH', `${base}/holds/${forced.body.data.id}`, { ...movePatch, detectOverlap: true }),
      409,
      'v2 patch overlap',
      'clubAdmin.holdOverlap'
    );
    expectStatus(await api.call(adminA.id, 'PATCH', `${base}/holds/${legacyOver.body.data.id}`, movePatch), 200, 'v2 patch without detectOverlap');
    expectStatus(await api.call(adminA.id, 'PATCH', `/club-admin/holds/${forced.body.data.id}`, { note: 'legacy ok' }), 200, 'legacy patch');
    const del = await api.call(adminA.id, 'DELETE', `${base}/holds/${s1}?scope=following`);
    expectStatus(del, 200, 'series delete');
    assert.deepEqual([...del.body.data.deletedIds].sort(), [s1, s2].sort());
    assert.equal(await prisma.courtSlotHold.count({ where: { id: { in: [s1, s2] }, deletedAt: null } }), 0, 'soft-deleted');
    const sched = await api.call(adminA.id, 'GET', `${base}/schedule?date=${clubLocalDate(hourAt(5), tz)}`);
    const schedHoldIds = (sched.body.data.slots as Array<{ type: string; holdId?: string; customerName?: string }>).filter((s) => s.type === 'hold');
    assert.ok(!schedHoldIds.some((s) => s.holdId === s1), 'deleted hold gone from schedule');
    assert.equal(schedHoldIds.find((s) => s.holdId === h1.body.data.id)?.customerName ?? 'Ana', 'Ana');

    /* --- bookings keyset paging ----------------------------------------------------------------- */
    const t0 = hourAt(30);
    for (let i = 0; i < 7; i++) {
      // Pairs share a start instant to exercise the id tie-break.
      await f.makeGame({ courtId: i % 2 ? a1.id : a2.id, startTime: new Date(t0.getTime() + Math.floor(i / 2) * H), endTime: new Date(t0.getTime() + Math.floor(i / 2) * H + H), name: `Keyset ${i}` });
    }
    for (let i = 0; i < 6; i++) {
      await prisma.courtSlotHold.create({
        data: { clubId: clubA.id, courtId: a1.id, startTime: new Date(t0.getTime() + i * H), endTime: new Date(t0.getTime() + i * H + 30 * 60_000), label: 'OTHER', createdByUserId: adminA.id, customerName: i === 0 ? 'Keyset Customer' : null },
      });
    }
    for (let i = 0; i < 5; i++) {
      await f.makeGame({ courtId: a1.id, startTime: new Date(Date.now() - (i + 2) * 24 * H), endTime: new Date(Date.now() - (i + 2) * 24 * H + H) });
      await prisma.courtSlotHold.create({
        data: { clubId: clubA.id, courtId: a2.id, startTime: new Date(Date.now() - (i + 2) * 24 * H), endTime: new Date(Date.now() - (i + 2) * 24 * H + H), label: 'WALK_IN', createdByUserId: adminA.id },
      });
    }
    for (const scope of ['upcoming', 'past'] as const) {
      const all = await api.call(adminA.id, 'GET', `${base}/bookings?scope=${scope}&limit=100`);
      expectStatus(all, 200, `${scope} all`);
      const expected = (all.body.data.items as Array<{ id: string }>).map((i) => i.id);
      assert.equal(all.body.data.nextCursor, null);
      const seen: string[] = [];
      let cursor: string | null = null;
      for (let guard = 0; guard < 50; guard++) {
        const page = await api.call(adminA.id, 'GET', `${base}/bookings?scope=${scope}&limit=4${cursor ? `&cursor=${cursor}` : ''}`);
        expectStatus(page, 200, `${scope} page`);
        seen.push(...(page.body.data.items as Array<{ id: string }>).map((i) => i.id));
        cursor = page.body.data.nextCursor;
        if (!cursor) break;
      }
      assert.deepEqual(seen, expected, `${scope}: pages = full list, no dupes or gaps`);
      assert.equal(new Set(seen).size, seen.length);
      assert.ok(seen.length >= (scope === 'upcoming' ? 13 : 10), `${scope} count ${seen.length}`);
      const times = (all.body.data.items as Array<{ startTime: string }>).map((i) => new Date(i.startTime).getTime());
      assert.deepEqual(times, [...times].sort((a, b) => (scope === 'upcoming' ? a - b : b - a)), `${scope} ordered`);
    }
    const holdsOnly = await api.call(adminA.id, 'GET', `${base}/bookings?kinds=hold&courtId=${a1.id}&limit=100`);
    assert.ok((holdsOnly.body.data.items as Array<{ kind: string; courtId: string }>).every((i) => i.kind === 'hold' && i.courtId === a1.id));
    const q = await api.call(adminA.id, 'GET', `${base}/bookings?q=keyset&limit=100`);
    assert.equal(q.body.data.items.length, 8, 'q matches game names and hold customers');
    const someGame = await prisma.game.findFirstOrThrow({ where: { name: 'Keyset 0' } });
    await prisma.clubCharge.create({ data: { clubId: clubA.id, sourceKind: 'GAME', gameId: someGame.id, amountCents: 4000, currency: 'EUR', createdById: adminA.id } });
    const unpaid = await api.call(adminA.id, 'GET', `${base}/bookings?payment=UNPAID&limit=100`);
    assert.deepEqual((unpaid.body.data.items as Array<{ id: string }>).map((i) => i.id), [`game:${someGame.id}`]);
    assert.equal(unpaid.body.data.items[0].billing.amountCents, 4000);
    const none = await api.call(adminA.id, 'GET', `${base}/bookings?payment=NONE&kinds=game&limit=100`);
    assert.ok(!(none.body.data.items as Array<{ id: string }>).some((i) => i.id === `game:${someGame.id}`));
    expectStatus(await api.call(adminA.id, 'GET', `${base}/bookings?scope=later`), 400, 'scope', 'clubAdmin.validation');
    expectStatus(await api.call(adminA.id, 'GET', `${base}/bookings?cursor=zzz`), 400, 'cursor', 'clubAdmin.validation');
    const legacy = await api.call(adminA.id, 'GET', `${base}/reservations?limit=5&offset=5`);
    expectStatus(legacy, 200, 'legacy reservations');
    assert.equal(legacy.body.data.items.length, 5);
    assert.equal(legacy.body.data.hasMore, true);

    /* --- team -------------------------------------------------------------------------------- */
    expectStatus(await api.call(adminA.id, 'DELETE', `${base}/team/${adminA.id}`), 409, 'last admin remove', 'clubAdmin.lastAdmin');
    expectStatus(await api.call(adminA.id, 'PATCH', `${base}/team/${adminA.id}`, { role: 'STAFF' }), 409, 'last admin demote', 'clubAdmin.lastAdmin');
    expectStatus(await api.call(adminA.id, 'POST', `${base}/team`, { userId: stranger.id, role: 'BOSS' }), 400, 'role', 'clubAdmin.validation');
    expectStatus(await api.call(adminA.id, 'POST', `${base}/team`, { userId: stranger.id, role: 'ADMIN' }), 201, 'add admin');
    expectStatus(await api.call(adminA.id, 'POST', `${base}/team`, { userId: stranger.id, role: 'STAFF' }), 409, 'dup', 'clubAdmin.alreadyMember');
    const demoted = await api.call(adminA.id, 'PATCH', `${base}/team/${adminA.id}`, { role: 'STAFF' });
    expectStatus(demoted, 200, 'demote with another admin');
    assert.equal((demoted.body.data as Array<{ isSelf: boolean; role: string }>).find((m) => m.isSelf)?.role, 'STAFF');
    expectStatus(await api.call(adminA.id, 'GET', `${base}/team`), 403, 'demoted loses team.manage', 'clubAdmin.capability');
    expectStatus(await api.call(stranger.id, 'PATCH', `${base}/team/${adminA.id}`, { role: 'ADMIN' }), 200, 'restore');
    expectStatus(await api.call(adminA.id, 'DELETE', `${base}/team/${stranger.id}`), 200, 'remove other admin');

    /* --- courts, profile, dashboard, activity ------------------------------------------------- */
    expectStatus(await api.call(adminA.id, 'POST', `${base}/courts/reorder`, { courtIds: [a1.id] }), 400, 'reorder partial', 'clubAdmin.validation');
    const reordered = await api.call(adminA.id, 'POST', `${base}/courts/reorder`, { courtIds: [a2.id, a1.id] });
    expectStatus(reordered, 200, 'reorder');
    assert.deepEqual((reordered.body.data as Array<{ id: string }>).map((c) => c.id), [a2.id, a1.id]);
    const created = await api.call(adminA.id, 'POST', `${base}/courts`, { name: 'A3', pricePerHourCents: 2550, isIndoor: true });
    expectStatus(created, 201, 'create court');
    assert.equal(created.body.data.pricePerHourCents, 2550);
    assert.equal(created.body.data.sortOrder, 2);
    expectStatus(await api.call(adminA.id, 'PATCH', `${base}/courts/${f.b1.id}`, { name: 'x' }), 404, 'foreign court v2', 'clubAdmin.notFound');
    const impact = await api.call(adminA.id, 'GET', `${base}/courts/${a2.id}/impact`);
    expectStatus(impact, 200, 'impact');
    assert.ok(impact.body.data.futureGames >= 1 && impact.body.data.nextBookingAt);

    expectStatus(await api.call(adminA.id, 'PATCH', `${base}/profile`, { currency: 'XXX' }), 400, 'currency', 'clubAdmin.validation');
    const profile = await api.call(adminA.id, 'PATCH', `${base}/profile`, { currency: 'RSD', phone: '+381 11 000', amenities: ['Bar'] });
    expectStatus(profile, 200, 'profile');
    assert.equal(profile.body.data.currency, 'RSD');
    assert.deepEqual(profile.body.data.amenities, ['Bar']);
    assert.equal(profile.body.data.integrationHealthy, null);

    const dash = await api.call(adminA.id, 'GET', `${base}/dashboard`);
    expectStatus(dash, 200, 'dashboard');
    assert.equal(dash.body.data.week.length, 7);
    assert.equal(dash.body.data.kpis.currency, 'RSD');
    assert.ok('expectedRevenueCents' in dash.body.data.kpis, 'admin sees revenue fields');
    const staffDash = await api.call(staffA.id, 'GET', `${base}/dashboard`);
    assert.ok(!('expectedRevenueCents' in staffDash.body.data.kpis), 'staff does not');

    const actions = new Set((await prisma.clubActivity.findMany({ where: { clubId: clubA.id }, select: { action: true } })).map((a) => a.action));
    for (const a of ['HOURS_UPDATED', 'HOLD_CREATED', 'HOLD_UPDATED', 'HOLD_DELETED', 'TEAM_ADDED', 'TEAM_REMOVED', 'TEAM_ROLE_CHANGED', 'COURTS_REORDERED', 'COURT_CREATED', 'CLUB_UPDATED'] as const) {
      assert.ok(actions.has(a), `activity ${a}`);
    }

    console.log('clubAdminConsole.integration.test.ts: ok');
  } finally {
    await f.cleanup();
    await api.close();
    await prisma.$disconnect();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
