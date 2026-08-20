import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const inviteControllerSrc = readFileSync(join(__dirname, '../../controllers/invite.controller.ts'), 'utf8');
const addToGameSrc = readFileSync(join(__dirname, './userTeamAddToGame.service.ts'), 'utf8');

assert.match(inviteControllerSrc, /stampInviteUserTeamId/);
assert.match(inviteControllerSrc, /resolvedInviteUserTeamId/);
assert.match(addToGameSrc, /toPromoteFromQueue/);
assert.match(addToGameSrc, /isInviteInboxVisible/);
assert.match(addToGameSrc, /viewerCanInviteFromLoadedGame/);
assert.match(addToGameSrc, /includeFullGameForPartner/);
assert.match(addToGameSrc, /emitCreatedGameInvite/);

console.log('userTeamAddToGame.contract.test.ts ok');
