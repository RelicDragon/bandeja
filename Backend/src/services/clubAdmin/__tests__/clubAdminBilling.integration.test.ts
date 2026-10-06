/**
 * Club console pricing, billing, reports, activity and reviews over HTTP against a real database
 * (docs/domains/club-admin.md "Pricing", "Billing", "Reports"):
 *   · pricing PUT/GET/quote; STAFF can read prices and collect money but not configure pricing,
 *     read reports, export, or see activity/reviews;
 *   · charge lifecycle create → partial → paid → void payment → waive; duplicate charge rejected
 *     (service and partial unique index); void rules; balance guard; MAINTENANCE never billable;
 *   · schedule/bookings billing summaries carry quotes (multi-court games summed);
 *   · dashboard unpaid_past; payments ledger paging and totals;
 *   · reports on a seeded day: exact occupancy, heatmap, players new vs returning, revenue,
 *     regulars privacy (inactive / unnamed / blocked excluded), cache invalidated by payments;
 *   · CSV export: BOM, revenue columns, formula escaping, players privacy.
 */
import assert from 'node:assert/strict';
import { EntityType, ParticipantRole, ParticipantStatus } from '@prisma/client';
import { addDaysToDate, clubLocalDate, clubWallTimeToUtc, isoWeekdayOfDate } from '@bandeja/shared/clubAdmin/clubTime';
import prisma from '../../../config/database';
import { createFixtures, expectStatus, startServer } from './clubAdminHarness';

void (async () => {
  const api = await startServer();
  const f = await createFixtures('billing', { timezoneA: 'Europe/Belgrade' });
  const { clubA, a1, a2, adminA, staffA, owner } = f;
  const tz = f.cityA.timezone;
  const base = `/club-admin/clubs/${clubA.id}`;
  const D = addDaysToDate(clubLocalDate(new Date(), tz), -10);
  const at = (date: string, h: number, m = 0) => clubWallTimeToUtc(date, h * 60 + m, tz);

  try {
    /* --- people ------------------------------------------------------------------------------ */
    const [p1, p2, p3, blockedU, inactiveU, unnamedU] = await Promise.all(
      ['p1', 'p2', 'p3', 'blocked', 'inactive', 'unnamed'].map((n) => f.user(n))
    );
    await prisma.user.updateMany({ where: { id: { in: [owner.id, p1.id, p2.id, p3.id, blockedU.id, inactiveU.id] } }, data: { nameIsSet: true } });
    await prisma.user.update({ where: { id: inactiveU.id }, data: { isActive: false } });
    await prisma.blockedUser.create({ data: { userId: blockedU.id, blockedUserId: adminA.id } });
    const join = (gameId: string, userIds: string[]) =>
      prisma.gameParticipant.createMany({
        data: userIds.map((userId) => ({ gameId, userId, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.PLAYING })),
      });

    /* --- hours + pricing ----------------------------------------------------------------------- */
    const weekly = ([1, 2, 3, 4, 5, 6, 7] as const).map((weekday) => ({ weekday, closed: false, open: '08:00', close: '22:00' }));
    expectStatus(await api.call(adminA.id, 'PUT', `${base}/hours`, { weekly, closures: [] }), 200, 'hours');
    const pricingBody = {
      currency: 'EUR',
      rules: [
        { courtId: null, label: 'Base', weekdays: [1, 2, 3, 4, 5, 6, 7], startMinute: 0, endMinute: 1440, pricePerHourCents: 2000 },
        { courtId: a1.id, label: 'A1 peak', weekdays: [1, 2, 3, 4, 5, 6, 7], startMinute: 18 * 60, endMinute: 22 * 60, pricePerHourCents: 3000 },
      ],
      billableHoldLabels: ['WALK_IN', 'PHONE', 'MAINTENANCE'],
    };
    expectStatus(await api.call(staffA.id, 'PUT', `${base}/pricing`, pricingBody), 403, 'staff cannot configure pricing', 'clubAdmin.capability');
    expectStatus(
      await api.call(adminA.id, 'PUT', `${base}/pricing`, { ...pricingBody, rules: [{ ...pricingBody.rules[0], courtId: f.b1.id }] }),
      400,
      'foreign court rule',
      'clubAdmin.validation'
    );
    const put = await api.call(adminA.id, 'PUT', `${base}/pricing`, pricingBody);
    expectStatus(put, 200, 'put pricing');
    assert.equal(put.body.data.rules.length, 2);
    assert.deepEqual(put.body.data.billableHoldLabels, ['WALK_IN', 'PHONE'], 'MAINTENANCE dropped');
    const staffPricing = await api.call(staffA.id, 'GET', `${base}/pricing`);
    expectStatus(staffPricing, 200, 'staff reads pricing');
    const q = await api.call(adminA.id, 'GET', `${base}/pricing/quote?courtId=${a1.id}&startTime=${at(D, 21).toISOString()}&endTime=${at(D, 23).toISOString()}`);
    expectStatus(q, 200, 'quote');
    assert.equal(q.body.data.amountCents, 3000 + 2000, 'peak hour on A1 + base hour');

    /* --- seeded day D ------------------------------------------------------------------------- */
    const g1 = await f.makeGame({ courtId: a1.id, startTime: at(D, 10), endTime: at(D, 11, 30), name: 'G1' });
    await join(g1.id, [p1.id, p2.id]);
    const g2 = await f.makeGame({ courtId: a1.id, startTime: at(D, 11), endTime: at(D, 12), name: 'G2' });
    await join(g2.id, [p1.id, p3.id]);
    await prisma.gameParticipant.updateMany({ where: { gameId: g2.id, userId: p3.id }, data: { noShowNotedAt: at(D, 13) } });
    const g3 = await f.makeGame({ courtId: a1.id, startTime: at(D, 19), endTime: at(D, 20), name: 'G3' });
    await prisma.gameCourt.create({ data: { gameId: g3.id, courtId: a2.id, order: 2 } });
    await join(g3.id, [p2.id, blockedU.id, inactiveU.id, unnamedU.id]);
    // History: owner and p1 played here before → returning.
    const old = await f.makeGame({ courtId: a1.id, startTime: at(addDaysToDate(D, -40), 10), endTime: at(addDaysToDate(D, -40), 11) });
    await join(old.id, [p1.id]);
    const hold = (courtId: string, label: 'WALK_IN' | 'MAINTENANCE' | 'PHONE', s: Date, e: Date, note: string | null = null) =>
      prisma.courtSlotHold.create({ data: { clubId: clubA.id, courtId, label, startTime: s, endTime: e, note, createdByUserId: adminA.id } });
    const walkIn = await hold(a2.id, 'WALK_IN', at(D, 14), at(D, 16));
    const maint = await hold(a2.id, 'MAINTENANCE', at(D, 16), at(D, 17));
    const phone = await hold(a1.id, 'PHONE', at(D, 21, 30), at(D, 23), '=HYPERLINK("x")');
    const cancelledId = `cancelled-${f.suffix}`;
    f.gameIds.push(cancelledId);
    await prisma.cancelledGame.create({
      data: { id: cancelledId, entityType: EntityType.GAME, cancelledByUserId: adminA.id, cityId: f.cityA.id, startTime: at(D, 9), clubId: clubA.id },
    });
    await prisma.clubReview.createMany({
      data: [
        { clubId: clubA.id, reviewerId: p1.id, gameId: g1.id, stars: 5, createdAt: at(D, 18) },
        { clubId: clubA.id, reviewerId: p2.id, gameId: g1.id, stars: 4, createdAt: at(D, 18, 5) },
        { clubId: clubA.id, reviewerId: inactiveU.id, gameId: g3.id, stars: 2, text: 'meh', createdAt: at(D, 21) },
      ],
    });

    /* --- billing summaries carry quotes ---------------------------------------------------------- */
    const bookings = await api.call(adminA.id, 'GET', `${base}/bookings?scope=past&from=${D}&to=${D}&limit=100`);
    expectStatus(bookings, 200, 'bookings');
    const item = (id: string) => (bookings.body.data.items as Array<{ id: string; billing: { quoteCents: number | null } | null }>).find((i) => i.id === id);
    assert.equal(item(`game:${g2.id}`)?.billing?.quoteCents, 2000);
    assert.equal(item(`game:${g3.id}`)?.billing?.quoteCents, 3000 + 2000, 'multi-court game = sum per court');
    assert.equal(item(`hold:${walkIn.id}`)?.billing?.quoteCents, 4000);
    assert.equal(item(`hold:${maint.id}`)?.billing, null, 'MAINTENANCE has no billing');
    const sched = await api.call(adminA.id, 'GET', `${base}/schedule?date=${D}`);
    const phoneSlot = (sched.body.data.slots as Array<{ type: string; holdId?: string; billing?: { quoteCents: number } }>).find((s) => s.holdId === phone.id);
    assert.equal(phoneSlot?.billing?.quoteCents, 1500 + 2000, 'schedule quote across a rule edge');

    /* --- charge lifecycle ------------------------------------------------------------------------- */
    const c1 = await api.call(adminA.id, 'POST', `${base}/charges`, { source: { kind: 'game', gameId: g1.id } });
    expectStatus(c1, 201, 'charge g1');
    assert.equal(c1.body.data.amountCents, 3000, 'defaults to quote');
    assert.equal(c1.body.data.status, 'UNPAID');
    assert.equal(c1.body.data.courtId, a1.id);
    const chargeId = c1.body.data.id as string;
    const pay = (userId: string, id: string, body: Record<string, unknown>) => api.call(userId, 'POST', `${base}/charges/${id}/payments`, body);
    const r1 = await pay(adminA.id, chargeId, { amountCents: 1000, method: 'CASH', paidAt: at(D, 12).toISOString() });
    expectStatus(r1, 201, 'pay 1000');
    assert.equal(r1.body.data.status, 'PARTIAL');
    const r2 = await pay(staffA.id, chargeId, { amountCents: 2000, method: 'CARD', paidAt: at(D, 12, 5).toISOString(), payerName: 'Ana' });
    expectStatus(r2, 201, 'staff collects');
    assert.equal(r2.body.data.status, 'PAID');
    assert.equal(r2.body.data.paidCents, 3000);
    expectStatus(await pay(adminA.id, chargeId, { amountCents: 1, method: 'CASH' }), 409, 'paid in full', 'clubAdmin.paymentExceedsBalance');
    expectStatus(await pay(adminA.id, chargeId, { amountCents: 0, method: 'CASH' }), 400, 'zero payment', 'clubAdmin.validation');
    expectStatus(await pay(adminA.id, chargeId, { amountCents: 10, method: 'BITCOIN' }), 400, 'method', 'clubAdmin.validation');
    expectStatus(
      await pay(adminA.id, chargeId, { amountCents: 10, method: 'CASH', paidAt: new Date(Date.now() + 3_600_000).toISOString() }),
      400,
      'future paidAt',
      'clubAdmin.validation'
    );
    const cardId = (r2.body.data.payments as Array<{ id: string; method: string }>).find((p) => p.method === 'CARD')!.id;
    const voided = await api.call(adminA.id, 'DELETE', `${base}/charges/${chargeId}/payments/${cardId}`);
    expectStatus(voided, 200, 'void payment');
    assert.equal(voided.body.data.status, 'PARTIAL');
    assert.equal(voided.body.data.paidCents, 1000);
    assert.ok((voided.body.data.payments as Array<{ id: string; voidedAt: string | null }>).find((p) => p.id === cardId)?.voidedAt, 'row kept, voided');
    expectStatus(await api.call(adminA.id, 'DELETE', `${base}/charges/${chargeId}/payments/${cardId}`), 200, 'void is idempotent');
    expectStatus(await pay(adminA.id, chargeId, { amountCents: 2500, method: 'CASH' }), 409, 'exceeds balance', 'clubAdmin.paymentExceedsBalance');
    expectStatus(await api.call(adminA.id, 'PATCH', `${base}/charges/${chargeId}`, { amountCents: 500 }), 400, 'below paid', 'clubAdmin.validation');
    expectStatus(await api.call(adminA.id, 'PATCH', `${base}/charges/${chargeId}`, { status: 'VOID' }), 409, 'void with payments', 'clubAdmin.chargeVoid');
    const waived = await api.call(adminA.id, 'PATCH', `${base}/charges/${chargeId}`, { status: 'WAIVED' });
    expectStatus(waived, 200, 'waive');
    assert.equal(waived.body.data.status, 'WAIVED');
    expectStatus(await api.call(adminA.id, 'POST', `${base}/charges`, { source: { kind: 'game', gameId: g1.id } }), 409, 'duplicate', 'clubAdmin.chargeExists');
    expectStatus(await api.call(adminA.id, 'GET', `${base}/charges/${chargeId}`), 200, 'get charge');
    expectStatus(await api.call(f.adminB.id, 'GET', `/club-admin/clubs/${f.clubB.id}/charges/${chargeId}`), 404, 'other club', 'clubAdmin.notFound');

    const c3 = await api.call(adminA.id, 'POST', `${base}/charges`, { source: { kind: 'game', gameId: g3.id }, amountCents: 4500 });
    expectStatus(c3, 201, 'charge g3 explicit amount');
    const ch = await api.call(staffA.id, 'POST', `${base}/charges`, { source: { kind: 'hold', holdId: walkIn.id } });
    expectStatus(ch, 201, 'staff charges hold');
    assert.equal(ch.body.data.amountCents, 4000);
    expectStatus(await pay(staffA.id, ch.body.data.id, { amountCents: 4000, method: 'TRANSFER', paidAt: at(D, 15).toISOString() }), 201, 'hold paid');
    await assert.rejects(
      prisma.clubCharge.create({ data: { clubId: clubA.id, sourceKind: 'HOLD', holdId: walkIn.id, amountCents: 1, currency: 'EUR' } }),
      (e: { code?: string }) => e.code === 'P2002',
      'partial unique index guards live hold charges'
    );
    expectStatus(await api.call(adminA.id, 'POST', `${base}/charges`, { source: { kind: 'hold', holdId: maint.id } }), 400, 'maintenance', 'clubAdmin.validation');
    expectStatus(await api.call(adminA.id, 'POST', `${base}/charges`, { source: { kind: 'manual' } }), 400, 'manual needs amount', 'clubAdmin.validation');
    const manual = await api.call(adminA.id, 'POST', `${base}/charges`, { source: { kind: 'manual' }, amountCents: 500, description: '=cmd' });
    expectStatus(manual, 201, 'manual');
    expectStatus(await api.call(adminA.id, 'PATCH', `${base}/charges/${manual.body.data.id}`, { status: 'VOID' }), 200, 'void manual');
    expectStatus(await pay(adminA.id, manual.body.data.id, { amountCents: 100, method: 'CASH' }), 409, 'pay void', 'clubAdmin.chargeVoid');
    expectStatus(await api.call(adminA.id, 'PATCH', `${base}/charges/${manual.body.data.id}`, { description: 'x' }), 409, 'edit void', 'clubAdmin.chargeVoid');

    /* --- ledger ------------------------------------------------------------------------------------ */
    const ledger = await api.call(staffA.id, 'GET', `${base}/payments?from=${D}&to=${D}`);
    expectStatus(ledger, 200, 'ledger');
    assert.equal(ledger.body.data.items.length, 3, 'voided rows listed');
    assert.equal(ledger.body.data.totals.collectedCents, 5000, 'voided excluded from totals');
    assert.deepEqual(ledger.body.data.totals.byMethod, { CASH: 1000, TRANSFER: 4000 });
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 10; i++) {
      const page = await api.call(adminA.id, 'GET', `${base}/payments?from=${D}&to=${D}&limit=1${cursor ? `&cursor=${cursor}` : ''}`);
      seen.push(...(page.body.data.items as Array<{ id: string }>).map((p) => p.id));
      cursor = page.body.data.nextCursor;
      if (!cursor) break;
    }
    assert.deepEqual(seen, (ledger.body.data.items as Array<{ id: string }>).map((p) => p.id), 'keyset pages = full list');
    assert.equal((await api.call(adminA.id, 'GET', `${base}/payments?method=CASH&from=${D}&to=${D}`)).body.data.items.length, 1);

    /* --- dashboard ----------------------------------------------------------------------------------- */
    const dash = await api.call(adminA.id, 'GET', `${base}/dashboard`);
    expectStatus(dash, 200, 'dashboard');
    const unpaid = (dash.body.data.attention as Array<{ kind: string; count?: number; amountCents?: number }>).find((a) => a.kind === 'unpaid_past');
    // g2 (quote 2000, no charge) + g3 (UNPAID 4500) + PHONE hold (quote 3500, no charge).
    assert.deepEqual([unpaid?.count, unpaid?.amountCents], [3, 2000 + 4500 + 3500]);
    assert.equal(dash.body.data.kpis.expectedRevenueCents, 0);
    assert.equal(dash.body.data.kpis.collectedCents, 0);

    /* --- capabilities ------------------------------------------------------------------------------ */
    for (const path of [`${base}/reports?from=${D}&to=${D}`, `${base}/activity`, `${base}/reviews`]) {
      expectStatus(await api.call(staffA.id, 'GET', path), 403, `staff ${path}`, 'clubAdmin.capability');
    }
    assert.equal((await api.callRaw(staffA.id, `${base}/reports/export.csv?from=${D}&to=${D}&dataset=bookings`)).status, 403, 'staff export');

    /* --- report ------------------------------------------------------------------------------------- */
    expectStatus(await api.call(adminA.id, 'GET', `${base}/reports?from=${D}&to=${addDaysToDate(D, 400)}`), 400, 'range', 'clubAdmin.rangeTooLarge');
    expectStatus(await api.call(adminA.id, 'GET', `${base}/reports?from=${D}&to=nope`), 400, 'bad date', 'clubAdmin.validation');
    const t0 = Date.now();
    const rep = await api.call(adminA.id, 'GET', `${base}/reports?from=${D}&to=${D}&compare=1`);
    const firstMs = Date.now() - t0;
    expectStatus(rep, 200, 'report');
    const r = rep.body.data;
    // A1: 10–12 (G1 ∪ G2) + 19–20 (G3) + 21:30–22 (PHONE, clipped at closing) = 210. A2: 14–16 + 19–20 = 180.
    assert.deepEqual(r.current.occupancy, { pct: 23.2, bookedMinutes: 390, openMinutes: 14 * 60 * 2 });
    assert.deepEqual(
      (r.perCourt as Array<{ courtId: string; bookedMinutes: number; games: number; collectedCents: number }>).map((c) => [c.courtId, c.bookedMinutes, c.games, c.collectedCents]),
      [[a1.id, 210, 3, 1000], [a2.id, 180, 1, 4000]]
    );
    const wd = isoWeekdayOfDate(D) - 1;
    assert.equal(r.heatmap[wd][10], 50, '10:00 bucket: A1 booked, A2 free');
    assert.equal(r.heatmap[wd][19], 100);
    assert.equal(r.heatmap[wd][7], 0, 'closed hour');
    assert.deepEqual(r.current.games, { total: 3, byEntityType: { GAME: 3 }, cancelled: 1, noShows: 1 });
    assert.deepEqual(r.current.holds, { total: 3, byLabel: { WALK_IN: 1, MAINTENANCE: 1, PHONE: 1 } });
    assert.deepEqual(r.current.players, { unique: 7, new: 5, returning: 2 });
    assert.deepEqual(r.current.revenue, {
      currency: 'EUR',
      expectedCents: 3000 + 2000 + 5000 + 4000 + 3500,
      chargedCents: 4500 + 4000,
      collectedCents: 5000,
      outstandingCents: 4500,
      byMethod: { CASH: 1000, TRANSFER: 4000 },
    });
    assert.deepEqual(r.current.reviews, { count: 3, averageStars: 3.67 });
    assert.equal(r.ratingTrend.length, 1);
    assert.equal(r.ratingTrend[0].count, 3);
    assert.deepEqual(r.daily, [{ date: D, occupancyPct: 23.2, bookedMinutes: 390, games: 3, players: 7, collectedCents: 5000 }]);
    const regulars = (r.topRegulars as Array<{ user: { id: string }; games: number }>).map((x) => [x.user.id, x.games]);
    const tie = [p1.id, p2.id].sort();
    assert.deepEqual(regulars, [[owner.id, 3], [tie[0], 2], [tie[1], 2], [p3.id, 1]], 'inactive, unnamed and blocked excluded');
    assert.equal(r.previous.occupancy.bookedMinutes, 0);
    assert.equal(r.previous.players.unique, 0);
    assert.deepEqual(r.period, { from: D, to: D, days: 1 });

    // Cached, then orphaned by a payment.
    const t1 = Date.now();
    await api.call(adminA.id, 'GET', `${base}/reports?from=${D}&to=${D}&compare=1`);
    console.log(`report: first ${firstMs} ms, cached ${Date.now() - t1} ms`);
    expectStatus(await pay(adminA.id, c3.body.data.id, { amountCents: 500, method: 'CASH', paidAt: at(D, 20).toISOString() }), 201, 'pay g3');
    const rep2 = await api.call(adminA.id, 'GET', `${base}/reports?from=${D}&to=${D}&compare=1`);
    assert.equal(rep2.body.data.current.revenue.collectedCents, 5500, 'billing mutation invalidates the cache');
    assert.equal(rep2.body.data.current.revenue.outstandingCents, 4000);

    /* --- CSV export ----------------------------------------------------------------------------------- */
    const csv = await api.callRaw(adminA.id, `${base}/reports/export.csv?from=${D}&to=${D}&dataset=bookings`);
    assert.equal(csv.status, 200);
    assert.ok(csv.contentType?.startsWith('text/csv'));
    assert.ok(csv.text.startsWith('\uFEFF'), 'UTF-8 BOM');
    const lines = csv.text.slice(1).trim().split('\r\n');
    assert.ok(lines[0].includes('quote') && lines[0].includes('payment_status'), 'revenue columns for ADMIN');
    assert.equal(lines.length, 1 + 6, '3 games + 3 holds');
    assert.ok(lines.some((l) => l.includes(`"'=HYPERLINK(""x"")"`)), 'formula escaped');
    assert.ok(lines[1].startsWith(`${D},10:00,11:30,game`), 'club-local, ordered by start');
    const players = await api.callRaw(adminA.id, `${base}/reports/export.csv?from=${D}&to=${D}&dataset=players`);
    const playerLines = players.text.slice(1).trim().split('\r\n');
    assert.equal(playerLines.length, 1 + 4, 'owner, p1, p2, p3 only');
    assert.ok(!players.text.includes('blocked') && !players.text.includes('inactive') && !players.text.includes('unnamed'));
    const payments = await api.callRaw(adminA.id, `${base}/reports/export.csv?from=${D}&to=${D}&dataset=payments`);
    assert.equal(payments.text.slice(1).trim().split('\r\n').length, 1 + 4);
    assert.equal((await api.callRaw(adminA.id, `${base}/reports/export.csv?from=${D}&to=${D}&dataset=secrets`)).status, 400);

    /* --- activity & reviews ------------------------------------------------------------------------ */
    const act = await api.call(adminA.id, 'GET', `${base}/activity?action=PAYMENT_RECORDED&limit=2`);
    expectStatus(act, 200, 'activity');
    assert.equal(act.body.data.items.length, 2);
    assert.ok(act.body.data.nextCursor);
    const act2 = await api.call(adminA.id, 'GET', `${base}/activity?action=PAYMENT_RECORDED&limit=10&cursor=${act.body.data.nextCursor}`);
    assert.equal(act2.body.data.items.length, 2, '4 payments recorded in total');
    assert.equal(act2.body.data.nextCursor, null);
    assert.equal(act.body.data.items[0].actor.id, adminA.id);
    assert.equal(act.body.data.items[0].meta.amountCents, 500);
    const actions = new Set((await prisma.clubActivity.findMany({ where: { clubId: clubA.id }, select: { action: true } })).map((a) => a.action));
    for (const a of ['PRICING_UPDATED', 'CHARGE_CREATED', 'CHARGE_UPDATED', 'PAYMENT_RECORDED', 'PAYMENT_VOIDED'] as const) assert.ok(actions.has(a), a);
    expectStatus(await api.call(adminA.id, 'GET', `${base}/activity?action=NOPE`), 400, 'action', 'clubAdmin.validation');
    const money = await api.call(adminA.id, 'GET', `${base}/activity?action=PAYMENT_RECORDED,PAYMENT_VOIDED&limit=100`);
    expectStatus(money, 200, 'activity, comma list');
    const moneyActions = (money.body.data.items as { action: string }[]).map((i) => i.action);
    assert.ok(moneyActions.length > 4 && moneyActions.includes('PAYMENT_VOIDED'), 'both actions returned');
    assert.ok(moneyActions.every((a) => a === 'PAYMENT_RECORDED' || a === 'PAYMENT_VOIDED'), 'only listed actions');
    expectStatus(await api.call(adminA.id, 'GET', `${base}/activity?action=PAYMENT_RECORDED,NOPE`), 400, 'action', 'clubAdmin.validation');
    const rev = await api.call(adminA.id, 'GET', `${base}/reviews?limit=2`);
    expectStatus(rev, 200, 'reviews');
    assert.deepEqual(rev.body.data.summary, { averageStars: 3.67, count: 3, distribution: { 1: 0, 2: 1, 3: 0, 4: 1, 5: 1 } });
    assert.equal(rev.body.data.items.length, 2);
    const rev2 = await api.call(adminA.id, 'GET', `${base}/reviews?limit=2&cursor=${rev.body.data.nextCursor}`);
    assert.equal(rev2.body.data.items.length, 1);
    assert.equal(rev2.body.data.items[0].author.id, p1.id, 'oldest last');
    assert.deepEqual(rev.body.data.items[0].author, { id: '', firstName: null, lastName: null, avatar: null }, 'inactive author hidden');

    console.log('clubAdminBilling.integration.test.ts: ok');
  } finally {
    await f.cleanup();
    await api.close();
    await prisma.$disconnect();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
