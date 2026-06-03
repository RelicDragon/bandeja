import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EntityType, Sport } from '@prisma/client';
import { ApiError } from '../../src/utils/ApiError';
import {
  assertGameSportMatchesLeagueSeason,
  resolveLeagueSeasonSport,
} from '../../src/utils/validators/validateLeagueSeasonSport';
import { validateGameForSport } from '../../src/utils/validators/validateGameForSport';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error('FAIL:', message);
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

function testSchemaSource(): void {
  const schema = readFileSync(join(__dirname, '../../prisma/schema.prisma'), 'utf8');
  assert(schema.includes('model LeagueSeason'), 'schema has LeagueSeason');
  assert(/model LeagueSeason[\s\S]*?sport\s+Sport/.test(schema), 'LeagueSeason has sport field');
}

function testServiceSource(): void {
  const createPath = join(__dirname, '../../src/services/league/create.service.ts');
  const gameCreationPath = join(__dirname, '../../src/services/league/gameCreation.util.ts');
  const updatePath = join(__dirname, '../../src/services/game/update.service.ts');
  const createSrc = readFileSync(createPath, 'utf8');
  const gameCreationSrc = readFileSync(gameCreationPath, 'utf8');
  const updateSrc = readFileSync(updatePath, 'utf8');

  assert(createSrc.includes('validateGameForSport'), 'league create validates sport');
  assert(createSrc.includes('sport: seasonSport'), 'league create sets season sport on game and season');
  assert(gameCreationSrc.includes('loadLeagueSeasonSportOrThrow'), 'league game creation loads season sport');
  assert(gameCreationSrc.includes('sport: seasonSport'), 'league child games inherit season sport');
  assert(gameCreationSrc.includes('validatePlayoffGameSetupForSeason'), 'playoff gameSetup validated per season sport');
  const bracketSrc = readFileSync(
    join(__dirname, '../../src/services/league/bracketPlayoff.service.ts'),
    'utf8',
  );
  assert(bracketSrc.includes('validatePlayoffGameSetupForSeason'), 'bracket create validates gameSetup');
  assert(updateSrc.includes('assertGameSportMatchesLeagueSeason'), 'game update enforces league season sport');
}

function testResolveAndAssert(): void {
  assert(
    resolveLeagueSeasonSport({ sport: Sport.TENNIS, game: { sport: Sport.PADEL } }) === Sport.TENNIS,
    'LeagueSeason.sport takes precedence',
  );
  assert(
    resolveLeagueSeasonSport({ game: { sport: Sport.TENNIS } }) === Sport.TENNIS,
    'falls back to season game sport',
  );
  assert(resolveLeagueSeasonSport({}) === Sport.PADEL, 'defaults to PADEL');

  assertThrows(
    () => assertGameSportMatchesLeagueSeason(Sport.TENNIS, { sport: Sport.PADEL }),
    'rejects cross-sport game vs season',
  );

  assert(
    validateGameForSport({
      sport: 'TENNIS',
      entityType: EntityType.LEAGUE_SEASON,
      maxParticipants: 4,
      gameType: 'CLASSIC',
    }) === Sport.TENNIS,
    'tennis league season validates via sport registry',
  );

  assertThrows(
    () =>
      validateGameForSport({
        sport: 'TENNIS',
        entityType: EntityType.LEAGUE_SEASON,
        maxParticipants: 4,
        gameType: 'AMERICANO',
      }),
    'tennis league season rejects AMERICANO',
  );
}

function main(): void {
  testSchemaSource();
  testServiceSource();
  testResolveAndAssert();
  console.log('multisport-phase4-leagues: all passed');
}

main();
