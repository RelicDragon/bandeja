import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'constants.ts'), 'utf8');
const statsBlock =
  src.match(/export const USER_STATS_TARGET_SELECT = \{([\s\S]*?)\} as const;/)?.[1] ?? '';
const userSelectBlock =
  src.match(/export const USER_SELECT_FIELDS = \{([\s\S]*?)\} as const;/)?.[1] ?? '';

assert.ok(statsBlock.length > 0, 'USER_STATS_TARGET_SELECT block');
assert.ok(userSelectBlock.length > 0, 'USER_SELECT_FIELDS block');

for (const field of [
  'preferredHandLeft',
  'preferredHandRight',
  'preferredCourtSideLeft',
  'preferredCourtSideRight',
] as const) {
  assert.match(statsBlock, new RegExp(`${field}: true`));
  assert.equal(userSelectBlock.includes(`${field}: true`), false, `${field} stays off USER_SELECT_FIELDS`);
}

console.log('ok: USER_STATS_TARGET_SELECT includes public preferred hand/side flags');
