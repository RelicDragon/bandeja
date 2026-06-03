import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Sport, SportLevelSource } from '@prisma/client';
import prisma from '../../src/config/database';
import {
  mapPlaytomicLevelToBandeja,
  parsePlaytomicSportLevels,
} from '../../src/integrations/playtomicSport';
import { syncPlaytomicLevelsToUser } from '../../src/services/integrations/playtomicProfileSync.service';
import { formatRatingHint, sportSupportsExternalRatingHint } from '../../src/utils/sportRating';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  }
}

function testPlaytomicMapping(): void {
  assert(mapPlaytomicLevelToBandeja(0) === 1.0, 'playtomic 0 → 1.0');
  const multi = parsePlaytomicSportLevels([
    { playtomicSportId: 'PADEL', level: 3.2 },
    { playtomicSportId: 'PICKLEBALL', level: 4.0, reliability: 55 },
  ]);
  assert(multi.length === 2, 'two sports parsed');
  assert(multi[1]!.externalHint === '4.0', 'external hint formatted');
}

function testSourceWiring(): void {
  const routes = readFileSync(join(__dirname, '../../src/routes/user.routes.ts'), 'utf8');
  const integrations = readFileSync(
    join(__dirname, '../../src/integrations/playtomicSport.ts'),
    'utf8',
  );
  const feApi = readFileSync(
    join(__dirname, '../../../Frontend/src/api/users.ts'),
    'utf8',
  );
  const feComp = readFileSync(
    join(__dirname, '../../../Frontend/src/components/profile/SportProfileExternalRating.tsx'),
    'utf8',
  );

  assert(routes.includes("'/profile/sync-playtomic'"), 'sync-playtomic route');
  assert(routes.includes("'/sport-profiles/:sport/external-rating'"), 'external-rating route');
  assert(integrations.includes('mapPlaytomicLevelToBandeja'), 'integrations level map');
  assert(feApi.includes('syncPlaytomicProfile'), 'FE sync API');
  assert(feApi.includes('updateSportExternalRating'), 'FE external rating API');
  assert(feComp.includes('formatRatingHint') === false, 'external rating edit does not duplicate badge');
  assert(feComp.includes('sportSupportsExternalRatingHint'), 'FE gates external UI');
}

function testRatingHint(): void {
  assert(
    formatRatingHint(Sport.TENNIS, 4.0, '3.5') === '≈ 3.5 Ntrp',
    'manual NTRP hint',
  );
  assert(sportSupportsExternalRatingHint(Sport.SQUASH), 'squash supports hint');
  assert(!sportSupportsExternalRatingHint(Sport.BADMINTON), 'badminton none');
}

async function testDbSync(): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { isActive: true },
    select: { id: true, level: true, sportsEnabled: true },
  });
  if (!user) {
    console.log('skip: db sync (no user)');
    return;
  }

  const beforePadel = user.level;
  const updated = await syncPlaytomicLevelsToUser(user.id, [
    { playtomicSportId: 'PADEL', level: 2.8 },
    { playtomicSportId: 'TENNIS', level: 4.5, reliability: 12 },
  ]);

  const padelProfile = updated.sportProfiles?.find((p) => p.sport === Sport.PADEL);
  const tennisProfile = updated.sportProfiles?.find((p) => p.sport === Sport.TENNIS);
  assert(padelProfile?.levelSource === SportLevelSource.PLAYTOMIC, 'padel PLAYTOMIC source');
  assert(padelProfile?.externalRatingHint === '2.8', 'padel external hint');
  assert(tennisProfile?.sport === Sport.TENNIS, 'tennis profile created');
  assert(updated.sportsEnabled?.includes(Sport.TENNIS), 'tennis enabled on sync');
  assert(updated.level === padelProfile?.level, 'User.level dual-write padel');

  await prisma.userSportProfile.updateMany({
    where: { userId: user.id, sport: { in: [Sport.PADEL, Sport.TENNIS] } },
    data: { levelSource: SportLevelSource.DEFAULT, externalRatingHint: null },
  });
  await prisma.user.update({ where: { id: user.id }, data: { level: beforePadel } });
  console.log('ok: db playtomic multi-sport sync');
}

async function main(): Promise<void> {
  testPlaytomicMapping();
  testSourceWiring();
  testRatingHint();
  await testDbSync();
  console.log('multisport-ratings-r5-r6: all passed');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
