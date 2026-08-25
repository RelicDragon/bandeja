import assert from 'node:assert/strict';
import {
  hasOpenPlayingSlot,
  mixPairsSeatIsFree,
  radarEntityTypes,
  rankMatchingGames,
} from './playIntentMatchingGames';
import { EntityType } from '@prisma/client';

{
  assert.deepEqual(radarEntityTypes(EntityType.BAR), [EntityType.BAR]);
  assert.deepEqual(radarEntityTypes(EntityType.GAME), [
    EntityType.GAME,
    EntityType.TOURNAMENT,
  ]);
  assert.equal(
    radarEntityTypes(EntityType.GAME).includes(EntityType.TRAINING),
    false,
  );
}

{
  assert.equal(hasOpenPlayingSlot(3, 4), true);
  assert.equal(hasOpenPlayingSlot(4, 4), false);
  assert.equal(hasOpenPlayingSlot(0, 0), false);
}

{
  assert.equal(mixPairsSeatIsFree('ANY', 'MALE', ['MALE', 'MALE'], 4), true);
  assert.equal(
    mixPairsSeatIsFree('MIX_PAIRS', 'MALE', ['MALE', 'FEMALE'], 4),
    true,
  );
  assert.equal(
    mixPairsSeatIsFree('MIX_PAIRS', 'MALE', ['MALE', 'MALE'], 4),
    false,
  );
  assert.equal(mixPairsSeatIsFree('MIX_PAIRS', 'OTHER', ['FEMALE'], 4), false);
  assert.equal(
    mixPairsSeatIsFree('MIX_PAIRS', 'FEMALE', ['FEMALE', 'FEMALE', 'FEMALE', 'MALE'], 6),
    false,
  );
  assert.equal(
    mixPairsSeatIsFree('MIX_PAIRS', 'FEMALE', ['FEMALE', 'MALE', 'MALE'], 6),
    true,
  );
}

{
  const ranked = rankMatchingGames(
    [
      {
        id: 'later-direct',
        allowDirectJoin: true,
        startTime: new Date('2026-08-21T18:00:00Z'),
        openSlots: 1,
        matchScore: 40,
      },
      {
        id: 'soon-queue',
        allowDirectJoin: false,
        startTime: new Date('2026-08-21T12:00:00Z'),
        openSlots: 3,
        matchScore: 50,
      },
      {
        id: 'soon-direct',
        allowDirectJoin: true,
        startTime: new Date('2026-08-21T12:00:00Z'),
        openSlots: 2,
        matchScore: 30,
      },
    ],
    2,
  );
  assert.deepEqual(
    ranked.map((game) => game.id),
    ['soon-direct', 'later-direct'],
  );
}

console.log('playIntentMatchingGames.test.ts: ok');
