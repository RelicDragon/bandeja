import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bookingProviderError as pkgBookingProviderError } from '@bandeja/shared/booking';
import { BOOKTIME_SNAPSHOT_FRESH_MS as pkgBooktimeSnapshotFreshMs } from '@bandeja/shared/gameBooking/booktimeSnapshotFreshness';
import { supportsClubBookingFlow as pkgSupportsClubBookingFlow } from '@bandeja/shared/gameBooking/supportsClubBookingFlow';
import { deriveBallsInGamesFromScoring } from './deriveBallsInGames';
import { GAME_FORMAT_UPDATE_KEYS } from './gameFormatUpdateKeys';

const repoRoot = join(__dirname, '../../..');
const feSharedRoot = join(repoRoot, 'Frontend/shared');

function normalizeSharedSource(src: string): string {
  return src
    .replace(/\/\*\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/\s+/g, '')
    .trim();
}

function extractSetKeys(src: string): string[] {
  const match = src.match(/new Set\(\[([\s\S]*?)\]\)/);
  assert(match, 'GAME_FORMAT_UPDATE_KEYS Set literal not found');
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
}

function testDeriveBallsInGamesSourceParity(): void {
  const feSrc = readFileSync(join(feSharedRoot, 'deriveBallsInGames.ts'), 'utf8');
  const beSrc = readFileSync(join(__dirname, 'deriveBallsInGames.ts'), 'utf8');
  assert.equal(
    normalizeSharedSource(feSrc),
    normalizeSharedSource(beSrc),
    'deriveBallsInGames.ts FE/BE source parity',
  );
}

function testDeriveBallsInGamesBehavior(): void {
  assert.equal(
    deriveBallsInGamesFromScoring({ sport: 'TABLE_TENNIS', scoringPreset: 'CLASSIC_3' }),
    false,
  );
  assert.equal(deriveBallsInGamesFromScoring({ scoringPreset: 'CLASSIC_3' }), true);
  assert.equal(deriveBallsInGamesFromScoring({ scoringPreset: 'POINTS_16' }), false);
  assert.equal(
    deriveBallsInGamesFromScoring({ winnerOfMatch: 'BY_SETS', maxTotalPointsPerSet: 0 }),
    true,
  );
}

function testGameFormatUpdateKeysParity(): void {
  const feSrc = readFileSync(join(feSharedRoot, 'gameFormatUpdateKeys.ts'), 'utf8');
  const beSrc = readFileSync(join(__dirname, 'gameFormatUpdateKeys.ts'), 'utf8');
  const feKeys = extractSetKeys(feSrc);
  const beKeys = extractSetKeys(beSrc);
  assert.deepEqual(feKeys, beKeys, 'GAME_FORMAT_UPDATE_KEYS FE/BE parity');
  assert(GAME_FORMAT_UPDATE_KEYS.has('affectsRating'));
}

function testGameBookingSharedParity(): void {
  for (const file of ['deriveGameTimeFromBookings.ts', 'contracts.ts']) {
    const feSrc = readFileSync(join(feSharedRoot, 'gameBooking', file), 'utf8');
    const beSrc = readFileSync(join(__dirname, 'gameBooking', file), 'utf8');
    assert.equal(
      normalizeSharedSource(feSrc),
      normalizeSharedSource(beSrc),
      `gameBooking/${file} FE/BE source parity`,
    );
  }
}

function testBookingSharedParity(): void {
  assert.equal(pkgBooktimeSnapshotFreshMs, 60_000);
  assert.deepEqual(
    pkgBookingProviderError('SlotTaken', 'taken'),
    { code: 'SlotTaken', message: 'taken' },
  );
  assert.equal(pkgSupportsClubBookingFlow('GAME'), true);
  assert.equal(pkgSupportsClubBookingFlow('LEAGUE'), false);
  assert.equal(pkgSupportsClubBookingFlow('LEAGUE', 'edit'), true);
}

function run(): void {
  testDeriveBallsInGamesSourceParity();
  testDeriveBallsInGamesBehavior();
  testGameFormatUpdateKeysParity();
  testGameBookingSharedParity();
  testBookingSharedParity();
  console.log('sharedModuleParity.test.ts: all passed');
}

run();
