import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { overlaySportProjection } from '../services/user/overlaySportProjection';

const PREFERENCE_FLAGS = [
  'preferredHandLeft',
  'preferredHandRight',
  'preferredCourtSideLeft',
  'preferredCourtSideRight',
] as const;

const constantsSrc = readFileSync(join(__dirname, 'constants.ts'), 'utf8');
const statsBlock =
  constantsSrc.match(/export const USER_STATS_TARGET_SELECT = \{([\s\S]*?)\} as const;/)?.[1] ?? '';
const userSelectBlock =
  constantsSrc.match(/export const USER_SELECT_FIELDS = \{([\s\S]*?)\} as const;/)?.[1] ?? '';

assert.ok(statsBlock.length > 0, 'USER_STATS_TARGET_SELECT block');
assert.ok(userSelectBlock.length > 0, 'USER_SELECT_FIELDS block');

for (const field of PREFERENCE_FLAGS) {
  assert.match(statsBlock, new RegExp(`${field}: true`));
  assert.equal(userSelectBlock.includes(`${field}: true`), false, `${field} stays off USER_SELECT_FIELDS`);
}

const controllerSrc = readFileSync(join(__dirname, '../controllers/user/stats.controller.ts'), 'utf8');
assert.match(controllerSrc, /select:\s*USER_STATS_TARGET_SELECT/);
assert.match(controllerSrc, /projectUserForSportContext\(user,/);
assert.match(controllerSrc, /user:\s*projectedUser/);

const projectorSrc = readFileSync(
  join(__dirname, '../services/user/userSportProfile.service.ts'),
  'utf8',
);
assert.match(projectorSrc, /overlaySportProjection\(/);

const projected = overlaySportProjection(
  {
    id: 'u1',
    preferredHandLeft: true,
    preferredHandRight: false,
    preferredCourtSideLeft: true,
    preferredCourtSideRight: false,
    sportProfiles: [{ sport: 'PADEL' }],
  },
  {
    level: 4,
    reliability: 10,
    gamesPlayed: 3,
    gamesWon: 1,
    approvedLevel: false,
    approvedById: null,
    approvedWhen: null,
  },
);

assert.equal(projected.preferredHandLeft, true);
assert.equal(projected.preferredHandRight, false);
assert.equal(projected.preferredCourtSideLeft, true);
assert.equal(projected.preferredCourtSideRight, false);
assert.equal(projected.level, 4);
assert.equal('sportProfiles' in projected, false);

console.log('ok: public stats select, controller, and projector keep preferred hand/side flags');
