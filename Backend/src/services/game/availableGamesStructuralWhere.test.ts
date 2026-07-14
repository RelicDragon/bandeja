import assert from 'node:assert/strict';
import {
  appendStructuralFiltersToWhere,
  parseStructuralFiltersFromQuery,
} from './availableGamesStructuralWhere';

{
  const parsed = parseStructuralFiltersFromQuery({
    clubIds: 'c1,c2',
    entityTypes: 'LEAGUE',
    hideBar: 'true',
    levelMin: '2',
    levelMax: '5',
    availableSlots: '1',
    mode: 'calendar',
  });
  assert.deepEqual(parsed.clubIds, ['c1', 'c2']);
  assert.ok(parsed.entityTypes?.includes('LEAGUE'));
  assert.ok(parsed.entityTypes?.includes('LEAGUE_SEASON'));
  assert.equal(parsed.hideBar, true);
  assert.equal(parsed.levelMin, 2);
  assert.equal(parsed.levelMax, 5);
  assert.equal(parsed.availableSlots, true);
  assert.equal(parsed.requireTimeSet, true);
}

{
  const upcoming = parseStructuralFiltersFromQuery({ mode: 'upcoming' });
  assert.equal(upcoming.requireTimeSet, false);
  assert.equal(upcoming.allowUnsetTimeLeagueSeason, true);
}

{
  const where = appendStructuralFiltersToWhere(
    { OR: [{ isPublic: true }] },
    {
      clubIds: ['club-1'],
      hideBar: true,
      requireTimeSet: true,
      levelMin: 2,
      levelMax: 4,
    },
  );
  assert.ok(Array.isArray(where.AND));
  assert.ok((where.AND as unknown[]).length >= 3);
}

{
  const defaults = parseStructuralFiltersFromQuery({
    levelMin: '1',
    levelMax: '7',
    mode: 'upcoming',
  });
  assert.equal(defaults.levelMin, undefined);
  assert.equal(defaults.levelMax, undefined);
}

console.log('availableGamesStructuralWhere.test.ts: ok');
