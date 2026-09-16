import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const serviceSrc = readFileSync(join(__dirname, 'participantSubstitution.service.ts'), 'utf8');
const routesSrc = readFileSync(join(__dirname, '../../routes/game.routes.ts'), 'utf8');
const lockedFieldsSrc = readFileSync(join(__dirname, 'gameResultsLockedFields.ts'), 'utf8');

// Substitution is the one roster change allowed while results are in progress, so the
// route must NOT carry the roster-mutable guard that blocks every other roster action.
const routeBlock = routesSrc.slice(
  routesSrc.indexOf("'/:id/substitute-participant'"),
  routesSrc.indexOf("'/:id/transfer-ownership'"),
);
assert.notEqual(routeBlock.length, 0, 'substitute-participant route is missing');
assert.match(routeBlock, /canEditGame/);
assert.equal(routeBlock.includes('canManageGameRoster'), false);

// The lifecycle window lives in the service: IN_PROGRESS only, never archived.
assert.match(serviceSrc, /resultsStatus !== ResultsStatus\.IN_PROGRESS/);
assert.match(serviceSrc, /isGameArchived\(game\)/);
assert.match(serviceSrc, /errors\.games\.substituteResultsFinal/);
assert.match(serviceSrc, /errors\.games\.substituteResultsNotStarted/);
assert.match(serviceSrc, /errors\.games\.substituteOutNotPlaying/);
assert.match(serviceSrc, /errors\.games\.substituteInAlreadyPlaying/);
assert.match(serviceSrc, /errors\.games\.substituteCannotReplaceTrainer/);
assert.match(serviceSrc, /errors\.games\.substituteSamePlayer/);

// The seat is handed over, never duplicated: the outgoing player is demoted rather than
// left PLAYING, which is what keeps the roster inside the frozen maxParticipants.
assert.match(serviceSrc, /status: 'NON_PLAYING'/);
assert.equal(
  lockedFieldsSrc.includes("'maxParticipants'"),
  true,
  'maxParticipants must stay frozen so substitution cannot grow the roster',
);

// Fixed-team membership must be updated in place; delete-and-recreate would orphan the
// Team.metadata.gameTeamId back-references that match sides rely on.
assert.match(serviceSrc, /gameTeamPlayer\.update/);
assert.equal(serviceSrc.includes('setGameTeams'), false);

// Match rosters are rewritten wholesale — the substitute inherits scored matches too.
assert.match(serviceSrc, /teamPlayer\.update/);

// League standings resolve a fixture by its roster key and carry roster aliases, so this
// path must refuse league games and leave them to LeagueTeamPlayerSwapService.
assert.match(serviceSrc, /EntityType\.LEAGUE_SEASON/);
assert.match(serviceSrc, /errors\.games\.substituteNotSupportedForLeague/);

// Rewriting match rosters changes results data, so results viewers must be told to reload.
// emitGameUpdate alone only refreshes the game, not the rounds held by the results engine.
assert.match(serviceSrc, /emitGameResultsUpdated/);

// The substitute was added by someone else, so they must not be excluded from the
// join notification the way a self-initiated join is.
const joinMessageCall = serviceSrc.slice(serviceSrc.indexOf('sendJoinMessage'));
assert.equal(
  joinMessageCall.slice(0, joinMessageCall.indexOf(';')).includes('excludeUserId'),
  false,
  'the incoming substitute must be notified',
);

// Leaving a playing seat mid-results would delete the participant while their scored
// TeamPlayer rows survive, and outcomes are seeded only from PLAYING participants.
const participantSrc = readFileSync(join(__dirname, 'participant.service.ts'), 'utf8');
assert.match(participantSrc, /errors\.games\.cannotLeaveResultsStarted/);
assert.match(participantSrc, /isGameResultsLocked/);

console.log('ok: participantSubstitution.contract.test.ts');
