/**
 * Q5 — registration primary sport selector (BE).
 */
import { Sport, SportLevelSource } from '@prisma/client';
import prisma from '../../src/config/database';
import { hashPassword } from '../../src/utils/hash';
import {
  parseRegistrationPrimarySport,
  registrationSportExplicitlyChosen,
  registrationSportUserFields,
} from '../../src/services/auth/registrationSport.service';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  }
}

function testParseRegistrationPrimarySport(): void {
  assert(parseRegistrationPrimarySport(undefined) === Sport.PADEL, 'omit → PADEL');
  assert(parseRegistrationPrimarySport('TENNIS') === Sport.TENNIS, 'TENNIS accepted');
}

function testAuthWiring(): void {
  const authSrc = readFileSync(
    join(__dirname, '../../src/controllers/auth.controller.ts'),
    'utf8',
  );
  assert(authSrc.includes('registrationSportUserFields'), 'phone register uses registration sport');
  const oauthSrc = readFileSync(
    join(__dirname, '../../src/services/auth/oauthLogin.service.ts'),
    'utf8',
  );
  assert(oauthSrc.includes('registrationSportUserFields'), 'oauth register uses registration sport');
  const tgSrc = readFileSync(
    join(__dirname, '../../src/controllers/telegramAuth.controller.ts'),
    'utf8',
  );
  assert(tgSrc.includes('parseRegistrationPrimarySport'), 'telegram verify accepts primarySport');
}

async function createRegistrationUser(
  phone: string,
  primarySportRaw: unknown,
): Promise<string> {
  const primarySport = parseRegistrationPrimarySport(primarySportRaw);
  const user = await prisma.user.create({
    data: {
      phone,
      passwordHash: await hashPassword('q5-test-pass'),
      firstName: 'Q5',
      lastName: 'Test',
      nameIsSet: true,
      ...registrationSportUserFields(primarySport, {
        primarySportIsSet: registrationSportExplicitlyChosen(primarySportRaw),
      }),
    },
    select: { id: true, primarySportIsSet: true },
  });
  const expectedIsSet = registrationSportExplicitlyChosen(primarySportRaw);
  assert(user.primarySportIsSet === expectedIsSet, `primarySportIsSet ${expectedIsSet}`);
  return user.id;
}

async function assertUserSportBootstrap(
  userId: string,
  expectedSport: Sport,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      primarySport: true,
      sportsEnabled: true,
      socialLevel: true,
    },
  });
  assert(!!user, 'user exists');
  assert(user!.primarySport === expectedSport, `primarySport ${expectedSport}`);
  assert(
    user!.sportsEnabled.length === 1 && user!.sportsEnabled[0] === expectedSport,
    'sportsEnabled is [choice] only',
  );

  const profile = await prisma.userSportProfile.findUnique({
    where: { userId_sport: { userId, sport: expectedSport } },
    select: { level: true, levelSource: true, gamesPlayed: true },
  });
  assert(!!profile, 'sport profile created');
  assert(profile!.level === 1.0, 'profile level 1.0');
  assert(profile!.levelSource === SportLevelSource.DEFAULT, 'levelSource DEFAULT');
  assert(profile!.gamesPlayed === 0, 'gamesPlayed 0');
}

async function testRegisterTennisAndDefaultPadel(): Promise<void> {
  const suffix = Date.now().toString().slice(-8);
  const tennisPhone = `+1555${suffix}1`;
  const padelPhone = `+1555${suffix}2`;

  const tennisUserId = await createRegistrationUser(tennisPhone, 'TENNIS');
  await assertUserSportBootstrap(tennisUserId, Sport.TENNIS);

  const padelUserId = await createRegistrationUser(padelPhone, undefined);
  await assertUserSportBootstrap(padelUserId, Sport.PADEL);

  await prisma.user.deleteMany({
    where: { id: { in: [tennisUserId, padelUserId] } },
  });
}

async function main(): Promise<void> {
  testParseRegistrationPrimarySport();
  testAuthWiring();
  await testRegisterTennisAndDefaultPadel();
  console.log('multisport-questionnaire-q5: OK');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
