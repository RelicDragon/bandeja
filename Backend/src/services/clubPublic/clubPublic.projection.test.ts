/**
 * PRD 354 — the guest club payload must leak nothing operator-only.
 *
 * `GET /clubs/:id` (the legacy endpoint) returns the raw `Club` row, which
 * carries `integrationConfig` — booking-provider credentials and venue ids.
 * These assertions are the reason `/clubs/:id/public` exists; if one of them
 * ever fails, the public club page is shipping secrets.
 */
import assert from 'node:assert/strict';
import {
  PUBLIC_CLUB_FORBIDDEN_KEYS,
  PUBLIC_CLUB_SELECT,
  PUBLIC_COURT_FORBIDDEN_KEYS,
  PUBLIC_COURT_SELECT,
  assertPublicClubContract,
  buildClubBookingCapability,
  findPublicClubContractIssues,
  projectPublicClub,
} from './clubPublic.projection';
// The pure halves are imported directly so this test never needs a database
// connection string (`config/database` throws without `DB_URL`).
import {
  applyRegularsBlockFilter,
  clubRegularsWindowStart,
  CLUB_REGULARS_LIMIT,
  CLUB_REGULARS_WINDOW_DAYS,
  type ClubRegular,
} from './clubPublicRegulars.privacy';
import {
  buildHourBuckets,
  markBusyHours,
  parseClubHour,
  resolveClubHourWindow,
} from './clubPublicToday.hours';

type ClubRow = Parameters<typeof projectPublicClub>[0];

function makeRow(overrides: Partial<Record<string, unknown>> = {}): ClubRow {
  return {
    id: 'club-1',
    name: 'Padel Central',
    description: 'Six indoor courts',
    avatar: null,
    photos: [],
    address: 'Main street 1',
    cityId: 'city-1',
    phone: '+381600000',
    email: 'hello@example.com',
    website: 'https://example.com',
    latitude: 44.8,
    longitude: 20.4,
    openingTime: '08:00',
    closingTime: '23:00',
    amenities: { showers: true },
    isBar: false,
    isForPlaying: true,
    sports: ['PADEL'],
    clubRating: 4.6,
    clubReviewCount: 38,
    courtsNumber: 6,
    defaultSlotMinutes: 90,
    cancellationNoticeHours: 24,
    policyText: 'Cancel 24h before.',
    integrationType: 'BOOKTIME',
    integrationConfig: { companyId: 'super-secret-company-id' },
    city: { id: 'city-1', name: 'Belgrade', country: 'RS', timezone: 'Europe/Belgrade' },
    courts: [
      {
        id: 'court-1',
        name: 'Court 3',
        sport: 'PADEL',
        courtType: 'DOUBLE',
        isIndoor: true,
        surfaceType: 'ARTIFICIAL_GRASS',
        pricePerHour: 30,
        webCameraUrl: null,
        integrationCourtName: 'C3',
      },
    ],
    ...overrides,
  } as unknown as ClubRow;
}

function projectionShape() {
  // The select is a whitelist: a column added to `Club` tomorrow is absent from
  // the public payload until somebody deliberately adds it here.
  for (const key of PUBLIC_CLUB_FORBIDDEN_KEYS) {
    if (key === 'integrationConfig') continue; // read to derive `booking`, stripped after
    assert.equal(
      key in PUBLIC_CLUB_SELECT,
      false,
      `${key} must not be selected for the public club payload`,
    );
  }
  for (const key of PUBLIC_COURT_FORBIDDEN_KEYS) {
    assert.equal(key in PUBLIC_COURT_SELECT, false, `${key} must not be selected for a public court`);
  }
  assert.equal('ptMeta' in PUBLIC_CLUB_SELECT, false);
}

function guestPayloadLeaksNothing() {
  const payload = projectPublicClub(makeRow(), {
    photos: [],
    carouselPhotos: [],
    isFavorite: false,
    isAdmin: false,
  });

  // Serialise exactly as Express would — a getter or non-enumerable would slip
  // past an `in` check on the live object but not past JSON.
  const serialised = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;

  assert.equal('integrationConfig' in serialised, false, 'integrationConfig must never reach a guest');
  assert.equal('integrationType' in serialised, false);
  assert.equal('ptMeta' in serialised, false);
  assert.equal('normalizedName' in serialised, false);
  assert.equal(JSON.stringify(serialised).includes('super-secret-company-id'), false);

  const courts = serialised.courts as Array<Record<string, unknown>>;
  assert.equal('externalCourtId' in courts[0], false, 'externalCourtId maps a court into the provider');

  assert.deepEqual(serialised.booking, { available: true, provider: 'BOOKTIME' });
  assert.deepEqual(findPublicClubContractIssues(serialised), []);
  assertPublicClubContract(serialised);

  // The guardrail must actually catch a regression, not just pass vacuously.
  const leaky = { ...serialised, integrationConfig: { companyId: 'x' } };
  assert.ok(
    findPublicClubContractIssues(leaky).some((i) => i.path === 'integrationConfig'),
    'the contract checker must flag a re-added integrationConfig',
  );
  const leakyCourt = {
    ...serialised,
    courts: [{ ...courts[0], externalCourtId: 'ext-1' }],
  };
  assert.ok(
    findPublicClubContractIssues(leakyCourt).some((i) => i.path === 'courts[0].externalCourtId'),
  );
  assert.ok(
    findPublicClubContractIssues({
      ...serialised,
      booking: { available: true, provider: 'BOOKTIME', config: { companyId: 'x' } },
    }).some((i) => i.path === 'booking.config'),
    'booking must expose capability only',
  );
}

function bookingCapability() {
  assert.deepEqual(
    buildClubBookingCapability({ integrationType: 'BOOKTIME', integrationConfig: { companyId: 'c' } }),
    { available: true, provider: 'BOOKTIME' },
  );
  // Malformed config: no provider at all, so the UI cannot offer a connect flow
  // that would immediately fail.
  assert.deepEqual(
    buildClubBookingCapability({ integrationType: 'BOOKTIME', integrationConfig: {} }),
    { available: false, provider: null },
  );
  assert.deepEqual(buildClubBookingCapability({}), { available: false, provider: null });
  assert.deepEqual(
    buildClubBookingCapability({
      integrationType: 'NSPADELSUPABASE',
      integrationConfig: { supabaseUrl: 'https://abc.supabase.co' },
    }),
    { available: true, provider: 'NSPADELSUPABASE' },
  );
}

function viewerFields() {
  const guest = projectPublicClub(makeRow(), {
    photos: [],
    carouselPhotos: [],
    isFavorite: false,
    isAdmin: false,
  });
  assert.equal(guest.isFavorite, false, 'guests are never favourited — never undefined');
  assert.equal(guest.isAdmin, false);

  const admin = projectPublicClub(makeRow(), {
    photos: [{ originalUrl: 'a', thumbnailUrl: 'a-t' }],
    carouselPhotos: [{ originalUrl: 'a', thumbnailUrl: 'a-t' }],
    isFavorite: true,
    isAdmin: true,
  });
  assert.equal(admin.isFavorite, true);
  assert.equal(admin.isAdmin, true);
  assert.equal(admin.photos.length, 1);
  // isAdmin is a capability flag, not a key to more data.
  assert.deepEqual(findPublicClubContractIssues(JSON.parse(JSON.stringify(admin))), []);
}

function regularsPrivacy() {
  const candidates: ClubRegular[] = Array.from({ length: 12 }, (_, i) => ({
    id: `u${i}`,
    firstName: `Player ${i}`,
    lastName: null,
    avatar: null,
    isPremium: false,
    showPremiumStatus: true,
    isTrainer: false,
    primarySport: 'PADEL',
  }));

  const all = applyRegularsBlockFilter(candidates, new Set());
  assert.equal(all.length, CLUB_REGULARS_LIMIT, 'the row is capped at 8');
  assert.deepEqual(all.map((r) => r.id), ['u0', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7']);

  // Blocks are honoured in both directions, and the row still fills up.
  const filtered = applyRegularsBlockFilter(candidates, new Set(['u0', 'u3']));
  assert.equal(filtered.length, CLUB_REGULARS_LIMIT);
  assert.equal(filtered.some((r) => r.id === 'u0'), false);
  assert.equal(filtered.some((r) => r.id === 'u3'), false);

  const shortList = applyRegularsBlockFilter(candidates.slice(0, 3), new Set(['u1']));
  assert.deepEqual(shortList.map((r) => r.id), ['u0', 'u2']);

  const now = new Date('2026-06-01T00:00:00.000Z');
  const start = clubRegularsWindowStart(now);
  assert.equal(
    Math.round((now.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)),
    CLUB_REGULARS_WINDOW_DAYS,
  );
}

function todayStrip() {
  assert.equal(parseClubHour('08:00', 7), 8);
  assert.equal(parseClubHour('8', 7), 8);
  assert.equal(parseClubHour(null, 7), 7);
  assert.equal(parseClubHour('nonsense', 7), 7);
  assert.equal(parseClubHour('99:00', 7), 7);

  assert.deepEqual(resolveClubHourWindow('08:00', '23:00'), { openHour: 8, closeHour: 23 });
  // Past-midnight closing renders to end of day rather than wrapping.
  assert.deepEqual(resolveClubHourWindow('08:00', '02:00'), { openHour: 8, closeHour: 24 });

  const buckets = buildHourBuckets('2026-06-01', 'Europe/Belgrade', 8, 11);
  assert.deepEqual(buckets.map((b) => b.hour), [8, 9, 10]);
  for (const bucket of buckets) {
    assert.equal(bucket.end - bucket.start, 60 * 60 * 1000);
  }

  const hours = markBusyHours(buckets, [
    { start: buckets[1].start, end: buckets[1].end },
  ]);
  assert.deepEqual(hours, [
    { hour: 8, busy: false },
    { hour: 9, busy: true },
    { hour: 10, busy: false },
  ]);

  // A block that only clips an hour still paints it busy.
  const clipped = markBusyHours(buckets, [
    { start: buckets[0].start + 30 * 60 * 1000, end: buckets[0].start + 45 * 60 * 1000 },
  ]);
  assert.equal(clipped[0].busy, true);
  assert.equal(clipped[1].busy, false);
}

function run() {
  projectionShape();
  guestPayloadLeaksNothing();
  bookingCapability();
  viewerFields();
  regularsPrivacy();
  todayStrip();
  console.log('clubPublic.projection.test.ts: ok');
}

run();
