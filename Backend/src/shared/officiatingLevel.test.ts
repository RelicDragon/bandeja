import assert from 'node:assert/strict';
import { Sport } from '@prisma/client';
import { getOfficiatingLevelForGame } from '../sport/sportRegistryCasual';
import {
  defaultOfficiatingForTier,
  officiatingIsStrict,
  officiatingShowsHonorHints,
  parseGameOfficiatingLevel,
  resolveOfficiatingLevel,
} from './officiatingLevel';

function testResolveDefaults(): void {
  assert.equal(
    resolveOfficiatingLevel({ sport: Sport.PICKLEBALL, preset: 'POINTS_21', presetMetaTier: 'social' }),
    'hints',
  );
  assert.equal(
    resolveOfficiatingLevel({ sport: Sport.PICKLEBALL, preset: 'BEST_OF_3_11', presetMetaTier: 'match' }),
    'strict',
  );
  assert.equal(
    resolveOfficiatingLevel({ sport: Sport.PADEL, preset: 'CLASSIC_BEST_OF_3', presetMetaTier: 'match' }),
    'strict',
  );
  assert.equal(
    resolveOfficiatingLevel({ sport: Sport.PADEL, preset: 'POINTS_24', presetMetaTier: 'social' }),
    'none',
  );
  assert.equal(defaultOfficiatingForTier('match'), 'strict');
  assert.equal(defaultOfficiatingForTier('social'), 'none');
  assert.equal(officiatingShowsHonorHints('hints'), true);
  assert.equal(officiatingShowsHonorHints('strict'), false);
  assert.equal(officiatingIsStrict('strict'), true);
}

function testGameMetadataOverride(): void {
  assert.equal(parseGameOfficiatingLevel({ officiatingLevel: 'strict' }), 'strict');
  assert.equal(
    getOfficiatingLevelForGame(Sport.PICKLEBALL, 'POINTS_21', { officiatingLevel: 'none' }),
    'none',
  );
  assert.equal(getOfficiatingLevelForGame(Sport.BADMINTON, 'BEST_OF_3_21'), 'strict');
  assert.equal(getOfficiatingLevelForGame(Sport.TENNIS, 'CLASSIC_BEST_OF_3'), 'strict');
}

function main(): void {
  testResolveDefaults();
  testGameMetadataOverride();
  console.log('officiatingLevel.test: passed');
}

main();
