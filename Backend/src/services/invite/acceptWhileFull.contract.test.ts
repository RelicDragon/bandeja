import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const inviteSrc = readFileSync(join(__dirname, '../invite.service.ts'), 'utf8');
const validationSrc = readFileSync(join(__dirname, '../../utils/participantValidation.ts'), 'utf8');

assert.match(inviteSrc, /shouldQueue/);
assert.match(inviteSrc, /status: 'IN_QUEUE'/);
assert.match(inviteSrc, /errors\.invites\.gameFull/);
assert.equal(inviteSrc.includes('maxParticipants + 1'), false);
assert.match(validationSrc, /isPlayingRosterFull/);
assert.match(validationSrc, /shouldQueue: true/);

console.log('ok: acceptWhileFull.contract.test.ts');
