import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const participantSrc = readFileSync(join(__dirname, '../game/participant.service.ts'), 'utf8');
const controllerSrc = readFileSync(join(__dirname, '../../controllers/invite.controller.ts'), 'utf8');
const shapeSrc = readFileSync(join(__dirname, './pendingInviteShape.ts'), 'utf8');

assert.match(shapeSrc, /genderTeams: true/);
assert.match(shapeSrc, /participants:/);
assert.match(participantSrc, /inboxInviteGameSelect/);
assert.match(participantSrc, /mapInvitedParticipantToInboxInvite\(participant\)/);
assert.match(controllerSrc, /isInviteInboxVisible\(invite\)/);
assert.match(controllerSrc, /inboxInviteGameSelect/);

console.log('ok: sendInviteInbox.contract.test.ts');
