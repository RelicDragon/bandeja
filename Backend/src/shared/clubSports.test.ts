import * as dotenv from 'dotenv';
import * as path from 'node:path';
import { Sport } from '@prisma/client';
import {
  assertClubSportsCoverCourtSports,
  assertCourtSportInClub,
  assertClubSupportsSport,
  assertCourtMatchesGameSport,
  clubSupportsSport,
  mergeClubSports,
  normalizeClubSportsOrder,
  parseClubSportsInput,
  syncClubSportsFromCourt,
} from './clubSports';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function assertThrows(fn: () => void, msg: string): void {
  try {
    fn();
    console.error('FAIL: expected throw:', msg);
    process.exit(1);
  } catch {
    /* expected */
  }
}

function runUnitTests(): void {
  assert(
    normalizeClubSportsOrder([Sport.TENNIS, Sport.PADEL]).join() === 'PADEL,TENNIS',
    'normalize order',
  );

  assert(parseClubSportsInput(['TENNIS', 'PADEL', 'TENNIS']).join() === 'PADEL,TENNIS', 'parse dedupes');

  assertThrows(() => parseClubSportsInput([]), 'empty sports');
  assertThrows(() => parseClubSportsInput(['FOO']), 'invalid sport');

  assertCourtSportInClub([Sport.PADEL], Sport.PADEL);
  assertThrows(
    () => assertCourtSportInClub([Sport.PADEL], Sport.TENNIS),
    'court sport not in club',
  );

  assertClubSportsCoverCourtSports([Sport.PADEL, Sport.TENNIS], [Sport.PADEL, null]);
  assertThrows(
    () => assertClubSportsCoverCourtSports([Sport.PADEL], [Sport.TENNIS]),
    'courts not covered',
  );

  const merged = mergeClubSports([Sport.PADEL], Sport.TENNIS);
  assert(merged.join() === 'PADEL,TENNIS', 'mergeClubSports adds sport in order');

  const unchanged = mergeClubSports([Sport.PADEL, Sport.TENNIS], Sport.PADEL);
  assert(unchanged.length === 2, 'mergeClubSports no-op length when present');
  assert(unchanged.join() === 'PADEL,TENNIS', 'mergeClubSports preserves existing');

  assert(clubSupportsSport([Sport.PADEL], [{ sport: Sport.PADEL }], Sport.PADEL), 'clubSupportsSport explicit');
  assert(!clubSupportsSport([Sport.PADEL], [{ sport: Sport.TENNIS }], Sport.TENNIS), 'clubSupportsSport mismatch');

  assertClubSupportsSport([Sport.PADEL, Sport.TENNIS], [{ sport: Sport.TENNIS }], Sport.TENNIS);
  assertThrows(
    () => assertClubSupportsSport([Sport.PADEL], [{ sport: Sport.PADEL }], Sport.TENNIS),
    'assertClubSupportsSport rejects',
  );

  assertCourtMatchesGameSport(Sport.PADEL, Sport.PADEL);
  assertCourtMatchesGameSport(null, Sport.TENNIS);
  assertThrows(
    () => assertCourtMatchesGameSport(Sport.PADEL, Sport.TENNIS),
    'assertCourtMatchesGameSport rejects',
  );
}

function ensureDbUrl(): boolean {
  let url = process.env.DB_URL;
  if (!url) return false;
  if (!/[?&]schema=/.test(url)) {
    url += (url.includes('?') ? '&' : '?') + 'schema=padelpulse';
    process.env.DB_URL = url;
  }
  return true;
}

async function runSyncTests(): Promise<void> {
  const { default: prisma } = await import('../config/database');
  const city = await prisma.city.findFirst({ select: { id: true } });
  if (!city) throw new Error('no City row');

  const suffix = `${Date.now()}`;
  const clubId = `qa-club-sports-${suffix}`;

  await prisma.club.create({
    data: {
      id: clubId,
      name: `QA Club Sports ${suffix}`,
      normalizedName: `qa-club-sports-${suffix}`,
      address: 'QA',
      cityId: city.id,
      sports: [Sport.PADEL],
    },
  });

  try {
    await syncClubSportsFromCourt(clubId, Sport.TENNIS);
    let club = await prisma.club.findUnique({ where: { id: clubId }, select: { sports: true } });
    assert(club?.sports.join() === 'PADEL,TENNIS', 'sync adds missing sport');

    await syncClubSportsFromCourt(clubId, Sport.TENNIS);
    club = await prisma.club.findUnique({ where: { id: clubId }, select: { sports: true } });
    assert(club?.sports.join() === 'PADEL,TENNIS', 'sync idempotent for existing sport');

    await syncClubSportsFromCourt(clubId, null);
    club = await prisma.club.findUnique({ where: { id: clubId }, select: { sports: true } });
    assert(club?.sports.join() === 'PADEL,TENNIS', 'sync null sport does not shrink club.sports');
  } finally {
    await prisma.court.deleteMany({ where: { clubId } });
    await prisma.club.delete({ where: { id: clubId } });
  }
}

async function runCourtPathTests(): Promise<void> {
  const { default: prisma } = await import('../config/database');
  const { ClubAdminCourtService } = await import('../services/clubAdmin/clubAdminCourt.service');

  const city = await prisma.city.findFirst({ select: { id: true } });
  const admin = await prisma.user.findFirst({ where: { isAdmin: false }, select: { id: true } });
  if (!city || !admin) throw new Error('need City and User rows');

  const suffix = `${Date.now()}`;
  const clubId = `qa-court-sync-${suffix}`;

  await prisma.club.create({
    data: {
      id: clubId,
      name: `QA Court Sync ${suffix}`,
      normalizedName: `qa-court-sync-${suffix}`,
      address: 'QA',
      cityId: city.id,
      sports: [Sport.PADEL],
    },
  });
  await prisma.clubAdmin.create({ data: { userId: admin.id, clubId } });

  try {
    await ClubAdminCourtService.createCourt(admin.id, clubId, {
      name: 'Tennis court',
      sport: Sport.TENNIS,
    });
    let club = await prisma.club.findUnique({ where: { id: clubId }, select: { sports: true } });
    assert(club != null && club.sports.includes(Sport.TENNIS), 'createCourt merges sport into club.sports');

    const court = await prisma.court.findFirst({ where: { clubId, sport: Sport.TENNIS }, select: { id: true } });
    assert(!!court?.id, 'tennis court created');

    await ClubAdminCourtService.patchCourt(admin.id, court!.id, { sport: null });
    club = await prisma.club.findUnique({ where: { id: clubId }, select: { sports: true } });
    assert(club != null && club.sports.includes(Sport.TENNIS), 'clearing court sport does not shrink club.sports');
  } finally {
    await prisma.clubAdmin.deleteMany({ where: { clubId } });
    await prisma.court.deleteMany({ where: { clubId } });
    await prisma.club.delete({ where: { id: clubId } });
  }
}

async function main(): Promise<void> {
  runUnitTests();
  console.log('ok: clubSports unit tests');

  if (!ensureDbUrl()) {
    console.log('clubSports.test: skipped DB tests (set DB_URL)');
    return;
  }

  await runSyncTests();
  console.log('ok: syncClubSportsFromCourt DB tests');

  await runCourtPathTests();
  console.log('ok: club admin court path sync');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
