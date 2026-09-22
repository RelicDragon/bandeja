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
  const multi = parseStructuralFiltersFromQuery({
    entityTypes: 'GAME,TOURNAMENT',
    mode: 'upcoming',
  });
  assert.deepEqual(multi.entityTypes, ['GAME', 'TOURNAMENT']);
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
  const where = appendStructuralFiltersToWhere({}, { levelMin: 2, levelMax: 4 });
  assert.ok(Array.isArray(where.AND));
  const levelClause = (where.AND as Array<Record<string, unknown>>).find(
    (clause) => Array.isArray(clause.OR),
  );
  assert.ok(levelClause);
  const levelOr = levelClause.OR as Array<Record<string, unknown>>;
  assert.deepEqual(levelOr[0], { entityType: 'BAR' });
  assert.deepEqual(levelOr[1], {
    AND: [
      { OR: [{ maxLevel: null }, { maxLevel: { gte: 2 } }] },
      { OR: [{ minLevel: null }, { minLevel: { lte: 4 } }] },
    ],
  });
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

{
  const excluded = appendStructuralFiltersToWhere({}, {});
  assert.ok(Array.isArray(excluded.AND));
  assert.ok(
    (excluded.AND as Array<Record<string, unknown>>).some(
      (clause) => clause.entityType && (clause.entityType as { not?: string }).not === 'EVENT',
    ),
  );
}

{
  const calendarIdle = appendStructuralFiltersToWhere({}, { requireTimeSet: true });
  assert.ok(Array.isArray(calendarIdle.AND));
  assert.ok(
    !(calendarIdle.AND as Array<Record<string, unknown>>).some(
      (clause) => clause.entityType && (clause.entityType as { not?: string }).not === 'EVENT',
    ),
  );
}

{
  const included = appendStructuralFiltersToWhere({}, { entityTypes: ['EVENT'] });
  assert.ok(Array.isArray(included.AND));
  assert.deepEqual(
    (included.AND as Array<Record<string, unknown>>).find(
      (clause) => clause.entityType && (clause.entityType as { in?: string[] }).in,
    ),
    { entityType: { in: ['EVENT'] } },
  );
}

/* PRD 360 — "Novices welcome" filter. */
{
  const parsed = parseStructuralFiltersFromQuery({ noviceOnly: '1', mode: 'upcoming' });
  assert.equal(parsed.noviceOnly, true);

  const off = parseStructuralFiltersFromQuery({ mode: 'upcoming' });
  assert.equal(off.noviceOnly, false);
}

{
  const where = appendStructuralFiltersToWhere({}, { noviceOnly: true });
  assert.ok(Array.isArray(where.AND));
  assert.ok(
    (where.AND as Array<Record<string, unknown>>).some(
      (clause) => clause.suitableForNovices === true,
    ),
  );
}

{
  // Off means "do not narrow", never `suitableForNovices: false` — an untagged
  // game is not a game that excludes novices.
  const where = appendStructuralFiltersToWhere({}, { noviceOnly: false });
  const clauses = Array.isArray(where.AND) ? (where.AND as Array<Record<string, unknown>>) : [];
  assert.ok(!clauses.some((clause) => 'suitableForNovices' in clause));
}

{
  // ANDed with the rest of the panel, exactly like every other structural filter.
  const where = appendStructuralFiltersToWhere(
    {},
    { noviceOnly: true, hideBar: true, requireTimeSet: true },
  );
  const clauses = where.AND as Array<Record<string, unknown>>;
  assert.ok(clauses.some((clause) => clause.suitableForNovices === true));
  assert.ok(clauses.some((clause) => (clause.entityType as { not?: string })?.not === 'BAR'));
  assert.ok(clauses.some((clause) => clause.timeIsSet === true));
}

console.log('availableGamesStructuralWhere.test.ts: ok');
