import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Sport } from '@prisma/client';
import {
  clubHasSupportedPlaytomicSport,
  mapPlaytomicSportToSport,
  SUPPORTED_PLAYTOMIC_SPORT_IDS,
} from '../../src/sport/playtomicSport';
import { SPORT_REGISTRY } from '../../src/sport/sportRegistry';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  }
}

function testRegistryPlaytomicIds(): void {
  for (const config of Object.values(SPORT_REGISTRY)) {
    if (!config.implemented) continue;
    assert(
      typeof config.playtomicSportId === 'string' && config.playtomicSportId.length > 0,
      `${config.id} has playtomicSportId`,
    );
  }
  assert(
    SUPPORTED_PLAYTOMIC_SPORT_IDS.length === 6,
    `expected 6 Playtomic sports, got ${SUPPORTED_PLAYTOMIC_SPORT_IDS.length}`,
  );
}

function testMapping(): void {
  const cases: Array<[string, Sport | null]> = [
    ['PADEL', Sport.PADEL],
    ['padel', Sport.PADEL],
    ['TENNIS', Sport.TENNIS],
    ['TABLE_TENNIS', Sport.TABLE_TENNIS],
    ['PICKLEBALL', Sport.PICKLEBALL],
    ['BADMINTON', Sport.BADMINTON],
    ['SQUASH', Sport.SQUASH],
    ['BASKETBALL', null],
    ['FOOTBALL7', null],
    ['', null],
  ];
  for (const [input, expected] of cases) {
    assert(
      mapPlaytomicSportToSport(input) === expected,
      `mapPlaytomicSportToSport(${JSON.stringify(input)})`,
    );
  }
}

function testClubFilter(): void {
  assert(clubHasSupportedPlaytomicSport(['PADEL']), 'padel-only club');
  assert(clubHasSupportedPlaytomicSport(['TENNIS', 'BASKETBALL']), 'tennis + unsupported');
  assert(!clubHasSupportedPlaytomicSport(['BASKETBALL']), 'basketball-only club');
  assert(!clubHasSupportedPlaytomicSport([]), 'empty sport_ids');
  assert(
    clubHasSupportedPlaytomicSport(['PADEL', 'TABLE_TENNIS']),
    'multi-sport padel + table tennis',
  );
}

function testLoadScriptSource(): void {
  const loaderPath = join(__dirname, '../load-playtomic-jsons.ts');
  const src = readFileSync(loaderPath, 'utf8');
  assert(!src.includes('sportIds.includes(PADEL)'), 'no PADEL-only club filter');
  assert(!src.includes("=== PADEL"), 'no padel-only resource filter');
  assert(src.includes('mapPlaytomicSportToSport'), 'uses Playtomic sport mapper');
  assert(src.includes('clubHasSupportedPlaytomicSport'), 'uses registry-backed club filter');
  assert(src.includes('sport,'), 'court create sets sport');
}

function main(): void {
  testRegistryPlaytomicIds();
  testMapping();
  testClubFilter();
  testLoadScriptSource();
  console.log('multisport-phase4-playtomic: all passed');
}

main();
