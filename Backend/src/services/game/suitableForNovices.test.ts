import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getEntityCapabilities } from '@bandeja/shared/entityCapabilities';
import {
  buildGameSeriesTemplate,
  parseGameSeriesTemplate,
} from '../gameSeries/gameSeriesTemplate';
import { GAME_RESULTS_LOCKED_FIELDS } from './gameResultsLockedFields';

/**
 * PRD 360 — "Novices welcome".
 *
 * The column itself is trivial; what is easy to break is the set of rules
 * around it, and every one of those rules fails silently:
 *  - a missing capability gate lets an EVENT listing claim the promise,
 *  - a missing update-whitelist entry makes the details toggle a no-op that
 *    still shows a success tick,
 *  - a missing series template key drops the flag on the second occurrence.
 */

const GAME_DIR = __dirname;

function sourceOf(...segments: string[]): string {
  return readFileSync(path.join(GAME_DIR, ...segments), 'utf8');
}

/* 1. Capability gate: exactly the four organizer-shaped entity types. */
{
  for (const entityType of ['GAME', 'TOURNAMENT', 'TRAINING', 'BAR'] as const) {
    assert.equal(
      getEntityCapabilities(entityType).hasNoviceTag,
      true,
      `${entityType} may carry the novice promise`,
    );
  }
  for (const entityType of ['LEAGUE', 'LEAGUE_SEASON', 'EVENT'] as const) {
    assert.equal(
      getEntityCapabilities(entityType).hasNoviceTag,
      false,
      `${entityType} must never carry the novice promise`,
    );
  }
}

/* 2. Create forces `false` for entity types without the capability. */
{
  const create = sourceOf('create.service.ts');
  assert.ok(
    /suitableForNovices:\s*getEntityCapabilities\(entityType\)\.hasNoviceTag/.test(create),
    'create.service.ts gates suitableForNovices on the entity capability',
  );
  assert.ok(
    /hasNoviceTag[\s\S]{0,120}:\s*false/.test(create),
    'the non-capable branch writes false rather than passing the client value through',
  );
}

/* 3. Update accepts it, and drops it for entity types without the capability. */
{
  const update = sourceOf('update.service.ts');
  assert.ok(
    /GAME_UNCHECKED_SCALAR_KEYS[\s\S]*'suitableForNovices'/.test(update),
    'update.service.ts whitelists suitableForNovices as a writable scalar',
  );
  assert.ok(
    /!getEntityCapabilities\(game\.entityType\)\.hasNoviceTag\)\s*\{\s*delete data\.suitableForNovices;/.test(
      update,
    ),
    'update.service.ts drops the key for entity types without the capability',
  );
}

/* 4. Frozen once results entry starts, like every other setting. */
{
  assert.ok(
    (GAME_RESULTS_LOCKED_FIELDS as readonly string[]).includes('suitableForNovices'),
    'suitableForNovices is locked with the other settings',
  );
}

/* 5. Series occurrences inherit the promise from the template. */
{
  const template = buildGameSeriesTemplate(
    {
      sport: 'PADEL',
      entityType: 'GAME',
      maxParticipants: 4,
      isPublic: true,
      suitableForNovices: true,
    },
    '2026-09-24',
  );
  assert.equal(template.suitableForNovices, true, 'the template carries the flag');

  const reparsed = parseGameSeriesTemplate(JSON.parse(JSON.stringify(template)));
  assert.equal(reparsed?.suitableForNovices, true, 'a stored template survives a round trip');

  // Off is a real value too — an organizer turning it off must not leave the
  // previous `true` behind on every future occurrence.
  const off = buildGameSeriesTemplate(
    { sport: 'PADEL', entityType: 'GAME', maxParticipants: 4, isPublic: true, suitableForNovices: false },
    '2026-09-24',
  );
  assert.equal(off.suitableForNovices, false);

  const patchSource = readFileSync(
    path.join(GAME_DIR, '..', 'gameSeries', 'gameSeries.service.ts'),
    'utf8',
  );
  assert.ok(
    patchSource.includes("copy('suitableForNovices')"),
    'an edited series pushes the flag onto its existing occurrences',
  );
  assert.ok(
    /suitableForNovices:\s*true,/.test(patchSource),
    'the seeding-game select reads the flag so the template can copy it',
  );
}

console.log('suitableForNovices.test.ts: ok');
