/**
 * Slot engine + `find_available_slots` (booking slice 7b). No DB, no provider calls: every
 * source (Nspadel, Weltner, occupancy, snapshot meta, club loading) is mocked.
 *
 *   npm run test:agent-slots
 */
import assert from 'node:assert/strict';
import type { OccupancyBlock } from '../../../../game/courtOccupancy.service';
import type { AgentPrincipal } from '../../../access/agentPrincipal';
import { slotInstants, zonedInstant } from '../clubTime';
import { LiveProviderCache, ProviderRateLimitedError } from '../liveProviderCache';
import { SLOT_REF_TTL_MS, mintSlotRef, verifySlotRef } from '../slotRef';
import {
  computeClubSlots,
  type SlotEngineClub,
  type SlotEngineRequest,
  type SlotEngineSources,
  type WeltnerTuples,
} from '../slotEngine';
import { MAX_SLOTS, assertSingleSport, confidenceNote, findAvailableSlots, type SlotSearchClub } from '../slotSearch';

const TZ = 'Europe/Belgrade';
const SECRET = 'test-slot-secret';

function principal(userId: string): AgentPrincipal {
  return { userId, isAdmin: false, isTrainer: false, canCreateTournament: false, canCreateLeague: false, currentCityId: 'city-1', language: 'en', agentMemoryEnabled: true };
}

function club(overrides: Partial<SlotEngineClub> = {}): SlotEngineClub {
  return {
    id: 'club-1',
    name: 'Club One',
    timeZone: TZ,
    openingTime: '08:00',
    closingTime: '22:00',
    provider: 'NONE',
    courts: [
      { id: 'A', name: 'Court A', externalCourtId: 'ext-a' },
      { id: 'B', name: 'Court B', externalCourtId: 'ext-b' },
      { id: 'C', name: 'Court C', externalCourtId: null },
    ],
    ...overrides,
  };
}

function block(
  kind: OccupancyBlock['kind'],
  courtId: string | null,
  start: string,
  end: string,
  flags: Partial<Pick<OccupancyBlock, 'hasBookedCourt' | 'clubBooked' | 'holdBlocked'>> = {},
): OccupancyBlock {
  return {
    kind,
    courtId,
    courtName: courtId,
    integrationCourtName: null,
    startTime: new Date(start).toISOString(),
    endTime: new Date(end).toISOString(),
    hasBookedCourt: flags.hasBookedCourt ?? false,
    clubBooked: flags.clubBooked ?? false,
    isFree: false,
    holdBlocked: flags.holdBlocked,
  };
}

type SourceOverrides = Partial<SlotEngineSources> & { blocks?: OccupancyBlock[] };

function sources(overrides: SourceOverrides = {}): SlotEngineSources & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    nspadelFreeRanges:
      overrides.nspadelFreeRanges ??
      (async () => {
        calls.push('nspadel');
        return { value: [], fetchedAt: new Date() };
      }),
    weltnerTuples:
      overrides.weltnerTuples ??
      (async () => {
        calls.push('weltner');
        return { value: [], fetchedAt: new Date() };
      }),
    occupancy:
      overrides.occupancy ??
      (async (input) => {
        calls.push(`occupancy:${input.externals}`);
        return overrides.blocks ?? [];
      }),
    snapshotFetchedAt: overrides.snapshotFetchedAt ?? (async () => null),
  };
}

function request(overrides: Partial<SlotEngineRequest> = {}): SlotEngineRequest {
  return { date: '2026-10-10', durationMinutes: 60, courts: 1, now: new Date('2026-10-01T10:00:00Z'), ...overrides };
}

const starts = (slots: { localTime: string }[]) => slots.map((slot) => slot.localTime);

async function testTimezoneAndDst() {
  // 2027-03-28: Belgrade springs forward 02:00 → 03:00 (02:xx does not exist).
  assert.equal(zonedInstant('2027-03-28', '02:30', TZ), null, 'nonexistent time rejected');
  // 2026-10-25: Belgrade falls back 03:00 → 02:00 (02:xx happens twice).
  assert.equal(zonedInstant('2026-10-25', '02:30', TZ), null, 'ambiguous time rejected');
  assert.equal(zonedInstant('2026-10-10', '10:00', TZ)?.toISOString(), '2026-10-10T08:00:00.000Z', 'club tz, not UTC');
  assert.equal(slotInstants('2026-10-25', 60, 60, TZ), null, '01:00–02:00 ends on an ambiguous time');

  const allDay = club({ openingTime: '00:00', closingTime: '00:00' });
  const spring = await computeClubSlots(allDay, request({ date: '2027-03-28', now: new Date('2027-03-27T10:00:00Z') }), sources());
  const springStarts = starts(spring.slots);
  for (const bad of ['01:00', '01:30', '02:00', '02:30']) assert.ok(!springStarts.includes(bad), `spring-forward: no ${bad} start`);
  assert.ok(springStarts.includes('00:30') && springStarts.includes('03:00'), 'spring-forward: neighbours kept');
  for (const slot of spring.slots) assert.equal(slot.end.getTime() - slot.start.getTime(), 3_600_000, 'real length = duration');

  const fall = await computeClubSlots(allDay, request({ date: '2026-10-25', now: new Date('2026-10-24T10:00:00Z') }), sources());
  const fallStarts = starts(fall.slots);
  for (const bad of ['01:30', '02:00', '02:30']) assert.ok(!fallStarts.includes(bad), `fall-back: no ${bad} start`);
  assert.ok(fallStarts.includes('00:30') && fallStarts.includes('03:00'), 'fall-back: neighbours kept');
  assert.equal(fall.slots.find((slot) => slot.localTime === '03:00')?.start.toISOString(), '2026-10-25T02:00:00.000Z', 'after fall-back = UTC+1');

  const past = await computeClubSlots(club(), request({ now: new Date('2026-10-10T10:10:00Z') }), sources());
  assert.equal(starts(past.slots)[0], '12:30', 'starts at or before now (12:10 club time) are dropped');
  console.log('  ok timezone + DST');
}

async function testAfterMidnight() {
  const late = club({ openingTime: '18:00', closingTime: '02:00' });
  const result = await computeClubSlots(late, request({ durationMinutes: 90, timeFrom: '23:00', timeTo: '00:30' }), sources());
  const last = result.slots[result.slots.length - 1];
  assert.equal(last.localTime, '00:30', 'last 90-min start before a 02:00 close');
  assert.equal(last.localDate, '2026-10-11', 'after-midnight start is on the next calendar day');
  assert.equal(last.end.toISOString(), '2026-10-11T00:00:00.000Z', '00:30 + 90 min = 02:00 local = 00:00Z');
  assert.deepEqual(
    result.slots.filter((slot) => slot.inWindow).map((slot) => slot.localTime),
    ['23:00', '23:30', '00:00', '00:30'],
    'window wraps midnight',
  );
  assert.ok(!starts(result.slots).includes('17:30'), 'nothing before opening');
  console.log('  ok after-midnight close');
}

async function testMultiCourt() {
  const blocks = [
    block('hold', 'A', '2026-10-10T08:00:00Z', '2026-10-10T09:00:00Z', { holdBlocked: true }), // 10:00–11:00
    block('external', 'B', '2026-10-10T08:30:00Z', '2026-10-10T09:30:00Z', { clubBooked: true, hasBookedCourt: true }), // 10:30–11:30
  ];
  const two = await computeClubSlots(club(), request({ courts: 2 }), sources({ blocks }));
  const at = (time: string) => two.slots.find((slot) => slot.localTime === time);
  assert.equal(at('10:00'), undefined, '10:00: only C is free');
  assert.deepEqual(at('09:30')?.courtIds, ['B', 'C'], '09:30: A overlaps its 10:00 hold, B is free until 10:30');
  assert.deepEqual(at('11:00')?.courtIds, ['A', 'C'], '11:00: B busy until 11:30');
  assert.deepEqual(at('11:30')?.courtIds, ['A', 'B'], '11:30: all free, name order');
  const three = await computeClubSlots(club(), request({ courts: 3 }), sources({ blocks }));
  assert.equal(three.slots.find((slot) => slot.localTime === '11:00'), undefined, '3 courts at 11:00: no');
  assert.deepEqual(three.slots.find((slot) => slot.localTime === '11:30')?.courtIds, ['A', 'B', 'C']);
  const four = await computeClubSlots(club(), request({ courts: 4 }), sources());
  assert.equal(four.status, 'no_courts');
  console.log('  ok multi-court intersection');
}

/** Agent chat 2026-10-07: tennis court for a padel game, 4 courts booked, outdoor court for "indoor". */
async function testCourtChoice() {
  const ksc = club({
    courts: [
      { id: 'T', name: 'Betonski teren', externalCourtId: null, isIndoor: false },
      { id: 'P1', name: 'Court 1', externalCourtId: null, isIndoor: false },
      { id: 'P4', name: 'Court 4', externalCourtId: null, isIndoor: true },
    ],
  });
  const result = await computeClubSlots(ksc, request({ timeFrom: '12:00', timeTo: '12:00' }), sources());
  const noon = result.slots.find((slot) => slot.localTime === '12:00');
  assert.deepEqual(noon?.courtIds, ['T'], 'one court per slotRef');
  assert.deepEqual(noon?.courtIndoor, [false]);
  assert.deepEqual(noon?.otherFreeCourts, [{ name: 'Court 1', indoor: false }, { name: 'Court 4', indoor: true }], 'the other free courts are visible without raising courts');

  const search = await findAvailableSlots(
    { principal: principal('u1'), locale: 'en', now: request().now },
    { clubId: 'club-1', date: '2026-10-10', timeFrom: '12:00', timeTo: '12:00', durationMinutes: 60, courts: 1 },
    { sources: sources(), loadClubs: async () => [{ ...ksc, cityName: 'Novi Sad' }] },
  );
  const slot = (search.data as { clubs: Array<{ slots: Array<{ courts: unknown; otherFreeCourts?: unknown }> }> }).clubs[0].slots[0];
  assert.deepEqual(slot.courts, [{ name: 'Betonski teren', indoor: false }]);
  assert.equal((slot.otherFreeCourts as unknown[]).length, 2);

  assert.throws(
    () => assertSingleSport([{ sports: ['PADEL', 'TENNIS'], courts: [{ sport: 'TENNIS' }, { sport: 'PADEL' }] }]),
    /sport is required/,
    'mixed padel/tennis club needs a sport',
  );
  assert.doesNotThrow(() => assertSingleSport([{ sports: ['PADEL', 'TENNIS'], courts: [{ sport: 'PADEL' }, { sport: null }] }]), 'courts decide, not club.sports');
  assert.doesNotThrow(() => assertSingleSport([{ sports: ['PADEL'], courts: [] }]));
  assert.throws(() => assertSingleSport([{ sports: ['PADEL'], courts: [] }, { sports: ['TENNIS'], courts: [] }]), /sport is required/, 'city search across sports');
  const booktime = club({ provider: 'BOOKTIME', courts: [{ id: 'U', name: 'A unmapped', externalCourtId: null }, { id: 'M', name: 'B mapped', externalCourtId: 'ext-m' }] });
  const snap = await computeClubSlots(booktime, request(), sources({ snapshotFetchedAt: async () => new Date('2026-10-01T09:00:00Z') }));
  assert.deepEqual(snap.slots[0]?.courtIds, ['M'], 'snapshot providers offer a court the app can book first');
  console.log('  ok court choice: sport guard, indoor flags, other free courts');
}

async function testSoftVsHard() {
  const soft = [block('game', 'A', '2026-10-10T08:00:00Z', '2026-10-10T09:00:00Z', { hasBookedCourt: false })];
  const softResult = await computeClubSlots(club(), request(), sources({ blocks: soft }));
  const tenSoft = softResult.slots.find((slot) => slot.localTime === '10:00');
  assert.ok(tenSoft, 'soft block keeps the slot');
  assert.deepEqual(tenSoft.courtIds, ['B'], 'a court without soft conflicts is preferred');
  assert.equal(tenSoft.softConflicts, 0);
  const softAll = await computeClubSlots(club(), request({ courts: 3 }), sources({ blocks: soft }));
  assert.equal(softAll.slots.find((slot) => slot.localTime === '10:00')?.softConflicts, 1, 'soft conflict is counted');

  const hard = [block('game', 'A', '2026-10-10T08:00:00Z', '2026-10-10T09:00:00Z', { hasBookedCourt: true })];
  const hardResult = await computeClubSlots(club(), request({ courts: 3 }), sources({ blocks: hard }));
  assert.equal(hardResult.slots.find((slot) => slot.localTime === '10:00'), undefined, 'game with a booked court is a hard block');
  const unassigned = [block('game', null, '2026-10-10T08:00:00Z', '2026-10-10T09:00:00Z', { hasBookedCourt: true })];
  const unassignedResult = await computeClubSlots(club(), request({ courts: 3 }), sources({ blocks: unassigned }));
  assert.equal(unassignedResult.slots.find((slot) => slot.localTime === '10:00')?.courtIds.length, 3, 'a game without a court blocks no specific court');
  console.log('  ok soft vs hard blocks');
}

async function testSnapshotConfidence() {
  const fetchedAt = new Date('2026-10-10T08:15:00Z'); // 10:15 in Belgrade
  const booktime = club({ provider: 'BOOKTIME' });
  const src = sources({ snapshotFetchedAt: async () => fetchedAt });
  const result = await computeClubSlots(booktime, request(), src);
  assert.equal(result.confidence, 'snapshot');
  assert.equal(result.asOf?.toISOString(), fetchedAt.toISOString());
  assert.ok(result.slots.every((slot) => slot.confidence === 'snapshot' && slot.asOf === fetchedAt));
  assert.ok(src.calls.includes('occupancy:true'), 'snapshot clubs read external snapshots');
  const note = confidenceNote(result, TZ, 'en');
  assert.match(note, /^No known conflicts as of 10:15\./);
  assert.ok(!/\bfree\b/i.test(note), 'never "free" for a snapshot');
  assert.match(confidenceNote(result, TZ, 'ru'), /10:15/);

  const missing = await computeClubSlots(club({ provider: 'PADELOO' }), request(), sources());
  assert.equal(missing.confidence, 'app_only', 'no snapshot for the date → only app data');
  assert.equal(missing.snapshotMissing, true);
  assert.equal(missing.asOf, null);
  assert.match(confidenceNote(missing, TZ, 'en'), /only games in the app/);

  const unsupported = await computeClubSlots(booktime, request({ durationMinutes: 90 }), src);
  assert.equal(unsupported.status, 'duration_not_supported', 'Booktime fallback durations are 60/120');
  assert.deepEqual(unsupported.allowedDurations, [60, 120]);

  const search = await findAvailableSlots(
    { principal: principal('u1'), locale: 'en', now: request().now },
    { clubId: 'club-1', date: '2026-10-10', durationMinutes: 60, courts: 1 },
    { sources: src, loadClubs: async () => [{ ...booktime, cityName: 'Niš' }] },
  );
  const slotEntity = search.entities.find((entity) => entity.type === 'slot');
  assert.ok(slotEntity && slotEntity.type === 'slot');
  assert.equal(slotEntity.confidence, 'snapshot');
  assert.equal(slotEntity.asOf, fetchedAt.toISOString());
  const data = search.data as { confidenceRules: Record<string, string> };
  assert.match(data.confidenceRules.snapshot, /no known conflicts as of/);
  console.log('  ok snapshot confidence wording');
}

async function testWeltnerTuples() {
  const weltner = club({ provider: 'WELTNER', openingTime: null, closingTime: null });
  const tuples: WeltnerTuples = [
    { courtId: 'A', slots: [{ start: '10:00', end: '11:30', duration: 90 }, { start: '10:30', end: '11:30', duration: 60 }] },
    { courtId: 'B', slots: [{ start: '10:00', end: '11:30', duration: 90 }, { start: '23:00', end: '00:30', duration: 90 }] },
  ];
  const fetchedAt = new Date('2026-10-01T09:59:00Z');
  const src = sources({ weltnerTuples: async () => ({ value: tuples, fetchedAt }) });
  const two = await computeClubSlots(weltner, request({ durationMinutes: 90, courts: 2 }), src);
  assert.equal(two.confidence, 'live');
  assert.deepEqual(two.slots.map((slot) => [slot.localTime, slot.courtIds]), [['10:00', ['A', 'B']]], 'only the shared exact tuple');
  const one = await computeClubSlots(weltner, request({ durationMinutes: 90 }), src);
  assert.deepEqual(starts(one.slots), ['10:00', '23:00'], 'starts come from tuples, not a 30-min grid');
  const late = one.slots[1];
  assert.equal(late.end.toISOString(), '2026-10-10T22:30:00.000Z', '23:00 + 90 crosses midnight (00:30 local)');
  assert.ok(!starts(one.slots).includes('10:30'), 'a 60-min tuple is not a 90-min slot');
  assert.equal(one.slots.find((slot) => slot.localTime === '10:00')?.asOf, fetchedAt, 'live asOf = fetch time');
  assert.ok(!src.calls.includes('occupancy:true'), 'live providers do not read snapshots');

  const held = await computeClubSlots(
    weltner,
    request({ durationMinutes: 90, courts: 2 }),
    sources({ weltnerTuples: async () => ({ value: tuples, fetchedAt }), blocks: [block('hold', 'B', '2026-10-10T08:00:00Z', '2026-10-10T09:00:00Z', { holdBlocked: true })] }),
  );
  assert.equal(held.slots.length, 0, 'an app hold still removes a live court');
  const far = await computeClubSlots(weltner, request({ date: '2026-11-15', durationMinutes: 90 }), src);
  assert.equal(far.status, 'date_out_of_range', 'Weltner horizon is 30 days');

  const nspadel = club({ provider: 'NSPADELSUPABASE' });
  const ns = await computeClubSlots(
    nspadel,
    request(),
    sources({ nspadelFreeRanges: async () => ({ value: [{ externalCourtId: 'ext-a', startTime: '10:00', endTime: '12:00' }], fetchedAt }) }),
  );
  assert.deepEqual(starts(ns.slots), ['10:00', '10:30', '11:00'], 'Nspadel free ranges → starts inside the range');
  assert.ok(ns.slots.every((slot) => slot.courtIds[0] === 'A'), 'mapped by externalCourtId');
  const failing = await computeClubSlots(nspadel, request(), sources({ nspadelFreeRanges: async () => { throw new Error('upstream 500'); } }));
  assert.equal(failing.status, 'provider_unavailable');
  assert.equal(failing.slots.length, 0, 'no guessing when the live provider fails');
  console.log('  ok Weltner tuples + Nspadel ranges');
}

async function testSlotRef() {
  const now = new Date('2026-10-01T10:00:00Z');
  const payload = { clubId: 'club-1', courtIds: ['A', 'B'], start: '2026-10-10T08:00:00.000Z', durationMinutes: 90, provider: 'WELTNER' as const, userId: 'u1' };
  const ref = mintSlotRef(payload, { now, secret: SECRET });
  assert.deepEqual(verifySlotRef(principal('u1'), ref, { now, secret: SECRET }), payload, 'round trip');

  const [prefix, body, signature] = ref.split('.');
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), k: ['A', 'B', 'C'] })).toString('base64url');
  const expectInvalid = (value: string, message: string, user = 'u1') =>
    assert.throws(() => verifySlotRef(principal(user), value, { now, secret: SECRET }), /agent\.slotRefInvalid/, message);
  expectInvalid(`${prefix}.${forged}.${signature}`, 'tampered payload');
  expectInvalid(`${prefix}.${body}.${signature.slice(0, -2)}xx`, 'tampered signature');
  expectInvalid(`s2.${body}.${signature}`, 'wrong version prefix');
  expectInvalid('garbage', 'malformed');
  expectInvalid(ref, 'another user', 'u2');
  assert.throws(() => verifySlotRef(principal('u1'), ref, { now, secret: 'other-secret' }), /agent\.slotRefInvalid/, 'other key');
  assert.throws(
    () => verifySlotRef(principal('u1'), ref, { now: new Date(now.getTime() + SLOT_REF_TTL_MS), secret: SECRET }),
    /agent\.slotRefExpired/,
    'expired after 15 min',
  );
  assert.ok(verifySlotRef(principal('u1'), ref, { now: new Date(now.getTime() + SLOT_REF_TTL_MS - 1), secret: SECRET }), 'valid just before expiry');
  console.log('  ok slotRef tamper / expiry / other user');
}

async function testRateLimitCache() {
  let clock = 1_000_000;
  const cache = new LiveProviderCache(() => clock, 60_000, 2, 300_000); // 2 fetches per 5 min
  let loads = 0;
  const load = async () => {
    loads += 1;
    return loads;
  };
  const [first, concurrent] = await Promise.all([cache.get('WELTNER', 'c1:2026-10-10', load), cache.get('WELTNER', 'c1:2026-10-10', load)]);
  assert.equal(loads, 1, 'concurrent callers share one fetch');
  assert.equal(first.value, concurrent.value);
  clock += 59_000;
  assert.equal((await cache.get('WELTNER', 'c1:2026-10-10', load)).value, 1, 'cached within 60 s');
  clock += 2_000;
  assert.equal((await cache.get('WELTNER', 'c1:2026-10-10', load)).value, 2, 'refetched after 60 s');
  await assert.rejects(cache.get('WELTNER', 'c2:2026-10-10', load), ProviderRateLimitedError, 'third fetch in a minute is refused');
  assert.equal(loads, 2);
  assert.equal((await cache.get('NSPADELSUPABASE', 'c1:2026-10-10:60', load)).value, 3, 'budgets are per provider');
  clock += 300_001;
  await assert.rejects(cache.get('WELTNER', 'bad', async () => { throw new Error('boom'); }), /boom/);
  assert.equal((await cache.get('WELTNER', 'bad', load)).value, 4, 'failures are not cached');

  const limited = await computeClubSlots(
    club({ provider: 'WELTNER' }),
    request(),
    sources({ weltnerTuples: async () => { throw new ProviderRateLimitedError('WELTNER'); } }),
  );
  assert.equal(limited.status, 'provider_rate_limited');
  console.log('  ok rate-limit cache');
}

async function testSearch() {
  const clubs: SlotSearchClub[] = ['c1', 'c2', 'c3'].map((id) => ({ ...club({ id, name: `Club ${id}`, openingTime: '06:00', closingTime: '23:30' }), cityName: 'Niš' }));
  const ctx = { principal: principal('u1'), locale: 'en', now: request().now };
  const all = await findAvailableSlots(ctx, { cityId: 'city-1', date: '2026-10-10', durationMinutes: 60, courts: 1 }, { sources: sources(), loadClubs: async () => clubs });
  const slotEntities = all.entities.filter((entity) => entity.type === 'slot');
  assert.equal(slotEntities.length, MAX_SLOTS, 'capped at 12');
  assert.equal(all.entities.filter((entity) => entity.type === 'club').length, 3, 'one club entity per club');
  assert.equal(new Set(slotEntities.map((entity) => entity.type === 'slot' && entity.clubId)).size, 3, 'every club gets a share');
  assert.equal(all.summary, 'Slots: 12 at 3 clubs');
  for (const entity of slotEntities) {
    if (entity.type !== 'slot') continue;
    const verified = verifySlotRef(principal('u1'), entity.slotRef, { now: ctx.now });
    assert.equal(verified.clubId, entity.clubId);
    assert.equal(verified.provider, 'NONE');
    assert.throws(() => verifySlotRef(principal('u2'), entity.slotRef, { now: ctx.now }), /slotRefInvalid/, 'ref bound to the searcher');
    assert.equal(entity.asOf, null, 'app_only slot has no asOf');
  }

  const blocked = [0, 1, 2].map(() => block('hold', 'A', '2026-10-10T16:00:00Z', '2026-10-10T19:00:00Z', { holdBlocked: true }));
  const oneCourt: SlotSearchClub = { ...club(), cityName: 'Niš', courts: [{ id: 'A', name: 'Court A', externalCourtId: null }] };
  const nearby = await findAvailableSlots(
    ctx,
    { clubId: 'club-1', date: '2026-10-10', timeFrom: '18:00', timeTo: '19:30', durationMinutes: 60, courts: 1 },
    { sources: sources({ blocks: blocked }), loadClubs: async () => [oneCourt] },
  );
  const nearbyData = nearby.data as { suggestion?: string; nearbyTimes?: boolean; clubs: Array<{ slots: Array<{ start: string }> }> };
  assert.equal(nearbyData.nearbyTimes, true, 'window empty → nearby times');
  assert.deepEqual(nearbyData.clubs[0].slots.map((slot) => slot.start), ['16:00', '16:30', '17:00', '21:00'], 'nearest starts around 18:00–19:30 (busy 18–21)');

  const none = await findAvailableSlots(ctx, { cityId: 'nowhere', date: '2026-10-10', durationMinutes: 60, courts: 1 }, { sources: sources(), loadClubs: async () => [] });
  assert.match(String((none.data as { suggestion: string }).suggestion), /No active clubs/);
  assert.equal(none.summary, 'No matching slots');
  console.log('  ok find_available_slots grouping / nearby / refs');
}

async function main() {
  await testTimezoneAndDst();
  await testAfterMidnight();
  await testMultiCourt();
  await testCourtChoice();
  await testSoftVsHard();
  await testSnapshotConfidence();
  await testWeltnerTuples();
  await testSlotRef();
  await testRateLimitCache();
  await testSearch();
  console.log('slotEngine.test.ts: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
