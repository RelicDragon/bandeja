import { Sport } from '@prisma/client';
import { getSportConfig, SPORT_REGISTRY } from '../sport/sportRegistry';
import {
  ROTATION_BY_SPORT,
  gameTypeMatchGenerationMismatch,
  gameTypesFromRotation,
} from './rotationFormats';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const ALL_SPORTS = Object.keys(SPORT_REGISTRY) as Sport[];

for (const sport of ALL_SPORTS) {
  const cfg = getSportConfig(sport);
  for (const gameType of gameTypesFromRotation(ROTATION_BY_SPORT[sport])) {
    assert(cfg.allowedGameTypes.includes(gameType), `${sport} allows rotation gameType ${gameType}`);
  }
}

assert(
  gameTypeMatchGenerationMismatch('AMERICANO', 'RATING') != null,
  'detects AMERICANO+RATING mismatch',
);
assert(
  gameTypeMatchGenerationMismatch('AMERICANO', 'RANDOM') == null,
  'accepts AMERICANO+RANDOM',
);

console.log('rotationFormats.test.ts OK');
