import assert from 'node:assert/strict';
import { EntityType } from '@prisma/client';
import { normalizeGameRatingFields } from './normalizeGameRatingFields';

assert.deepEqual(
  normalizeGameRatingFields({
    entityType: EntityType.BAR,
    minLevel: 2.5,
    maxLevel: 4.5,
    affectsRating: true,
  }),
  {
    minLevel: null,
    maxLevel: null,
    affectsRating: false,
  },
);

assert.deepEqual(
  normalizeGameRatingFields({
    entityType: EntityType.GAME,
    minLevel: 2.5,
    maxLevel: 4.5,
    affectsRating: true,
  }),
  {
    minLevel: 2.5,
    maxLevel: 4.5,
    affectsRating: true,
  },
);

console.log('normalizeGameRatingFields.test.ts: ok');
