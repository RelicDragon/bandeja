import { Sport } from '@prisma/client';
import { assertRegistryMatchesPrismaEnum } from '../../src/sport/sportRegistry';
import {
  validateGameForSport,
  validateMaxParticipants,
} from '../../src/utils/validators/validateGameForSport';
import { ApiError } from '../../src/utils/ApiError';
import prisma from '../../src/config/database';
import { GameCreateService } from '../../src/services/game/create.service';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function assertThrows(fn: () => void, msg: string): void {
  try {
    fn();
    console.error('FAIL: expected throw —', msg);
    process.exit(1);
  } catch (e) {
    if (!(e instanceof ApiError)) {
      console.error('FAIL: wrong error type —', msg, e);
      process.exit(1);
    }
  }
}

assertRegistryMatchesPrismaEnum();
console.log('ok: registry ↔ Prisma Sport enum');

assert(validateGameForSport({ sport: 'PADEL', maxParticipants: 4 }) === Sport.PADEL, 'padel 4 players');
assert(
  validateGameForSport({ sport: 'PADEL', maxParticipants: 8 }) === Sport.PADEL,
  'padel 8 roster passes sport validator',
);
assert(validateGameForSport({ sport: undefined }) === Sport.PADEL, 'default padel');

assertThrows(() => validateMaxParticipants(3, 12), 'roster rejects 3');
assert(validateMaxParticipants(8, 12) === undefined, 'roster allows 8 within cap');

assertThrows(
  () =>
    validateGameForSport({
      sport: 'TENNIS',
      maxParticipants: 4,
      gameType: 'AMERICANO',
    }),
  'tennis rejects AMERICANO',
);

assert(
  validateGameForSport({ sport: 'PADEL', maxParticipants: 2 }) === Sport.PADEL,
  'padel allows 2 players (legacy / tests)',
);

assertThrows(
  () =>
    validateGameForSport({
      sport: 'TENNIS',
      scoringPreset: 'POINTS_21',
    }),
  'tennis rejects POINTS_21',
);

async function testCreateWithoutSport() {
  const city = await prisma.city.findFirst({ select: { id: true } });
  if (!city) {
    console.log('skip: create without sport (no city in DB)');
    return;
  }
  const user = await prisma.user.findFirst({
    where: { isActive: true, currentCityId: { not: null } },
    select: { id: true, currentCityId: true },
  });
  if (!user?.currentCityId) {
    console.log('skip: create without sport (no active user with city)');
    return;
  }

  const start = new Date(Date.now() + 86400000);
  const end = new Date(start.getTime() + 7200000);
  const game = await GameCreateService.createGame(
    {
      gameType: 'CLASSIC',
      cityId: user.currentCityId,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      maxParticipants: 4,
      participants: [user.id],
    },
    user.id,
    false,
  );

  assert(game != null, 'createGame returned a game');
  assert(game!.sport === Sport.PADEL, 'created game defaults to PADEL');

  await prisma.gameParticipant.deleteMany({ where: { gameId: game!.id } });
  await prisma.game.delete({ where: { id: game!.id } });
  console.log('ok: create game without sport in body');
}

async function auditNoMySportFilter() {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const readServicePath = join(__dirname, '../../src/services/game/read.service.ts');
  const invitePath = join(__dirname, '../../src/services/invite.service.ts');
  const readSrc = readFileSync(readServicePath, 'utf8');
  const inviteSrc = readFileSync(invitePath, 'utf8');

  const myBlock = readSrc.slice(readSrc.indexOf('getMyGames'), readSrc.indexOf('getMyGamesWithUnread'));
  assert(!/sport\s*:/.test(myBlock), 'getMyGames must not filter by sport');
  assert(!/where\.sport/.test(inviteSrc), 'invites must not filter by sport');
  console.log('ok: My / invites audit — no sport filter in source');
}

async function main() {
  await auditNoMySportFilter();
  await testCreateWithoutSport();
  await prisma.$disconnect();
  console.log('multisport-phase0: all passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
