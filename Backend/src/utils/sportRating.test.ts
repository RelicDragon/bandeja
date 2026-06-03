import assert from 'node:assert/strict';
import {
  mapPlaytomicLevelToBandeja,
  parsePlaytomicSportLevels,
} from '../integrations/playtomicSport';
import { Sports } from '../sport/sportIds';
import {
  formatRatingHint,
  normalizeExternalRatingHint,
  sportSupportsExternalRatingHint,
} from './sportRating';

function testMapPlaytomicLevel(): void {
  assert.equal(mapPlaytomicLevelToBandeja(0), 1.0);
  assert.equal(mapPlaytomicLevelToBandeja(4.2), 4.2);
  assert.equal(mapPlaytomicLevelToBandeja(7), 7.0);
}

function testParsePlaytomicLevels(): void {
  const parsed = parsePlaytomicSportLevels([
    { playtomicSportId: 'PADEL', level: 3.5 },
    { playtomicSportId: 'TENNIS', level: 5.1 },
    { playtomicSportId: 'BASKETBALL', level: 4 },
  ]);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0]!.sport, Sports.PADEL);
  assert.equal(parsed[1]!.sport, Sports.TENNIS);
}

function testFormatRatingHint(): void {
  assert.equal(formatRatingHint(Sports.PADEL, 3.0, '4.0'), '≈ 4.0 Playtomic');
  assert.equal(formatRatingHint(Sports.BADMINTON, 3.0, null), null);
  assert.ok(sportSupportsExternalRatingHint(Sports.PICKLEBALL));
  assert.ok(!sportSupportsExternalRatingHint(Sports.BADMINTON));
}

function testNormalizeExternalHint(): void {
  assert.equal(normalizeExternalRatingHint('  3.5 '), '3.5');
  assert.equal(normalizeExternalRatingHint(null), null);
  assert.throws(() => normalizeExternalRatingHint('x'.repeat(33)));
}

testMapPlaytomicLevel();
testParsePlaytomicLevels();
testFormatRatingHint();
testNormalizeExternalHint();
console.log('sportRating.test: ok');
