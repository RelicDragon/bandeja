import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const cleanupSrc = readFileSync(join(__dirname, 'gameInviteCleanup.ts'), 'utf8');
assert.match(cleanupSrc, /export const INVITE_CLEANUP_STATUSES = \['INVITED'\] as const/);
assert.match(cleanupSrc, /status: \{ in: \[\.\.\.INVITE_CLEANUP_STATUSES\] \}/);
assert.equal(cleanupSrc.includes('maxParticipants'), false);
assert.equal(cleanupSrc.includes('isPlayingRosterFull'), false);
assert.equal(cleanupSrc.includes('isInviteInboxVisible'), false);

console.log('ok: gameInviteCleanup.contract.test.ts');
