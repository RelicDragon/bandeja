import assert from 'node:assert/strict';
import { sortedPlayerKey, rostersEqual } from './leagueParticipantResolve';
import { teamPlayerSig, matchupKeyFromSigs } from './generation/fixedTeamsRoundMatching';

function testSortedPlayerKeyStable(): void {
  assert.equal(sortedPlayerKey(['b', 'a']), 'a:b');
  assert.equal(sortedPlayerKey(['a', 'b']), sortedPlayerKey(['b', 'a']));
}

function testRostersEqualIgnoresOrder(): void {
  assert.equal(rostersEqual(['a', 'b'], ['b', 'a']), true);
  assert.equal(rostersEqual(['a', 'b'], ['a', 'c']), false);
  assert.equal(rostersEqual(['a'], ['a', 'b']), false);
}

function gameTeamIncludesOutAndStaying(
  playerIds: string[],
  outUserId: string,
  stayingUserIds: string[],
): boolean {
  if (!playerIds.includes(outUserId)) return false;
  return stayingUserIds.every((id) => playerIds.includes(id));
}

function testFranchiseMatchOnPartialRoster(): void {
  assert.equal(
    gameTeamIncludesOutAndStaying(['injured', 'partner'], 'injured', ['partner']),
    true,
  );
  assert.equal(
    gameTeamIncludesOutAndStaying(['other', 'partner'], 'injured', ['partner']),
    false,
  );
}

/** Sig (comma) vs rosterKey (colon) must round-trip for alias lookups from fixtures. */
function testSigAndRosterKeyAlignment(): void {
  const ids = ['cmz', 'cma'];
  const sig = teamPlayerSig(ids);
  const key = sortedPlayerKey(ids);
  assert.equal(sig.split(',').sort().join(':'), key);
  assert.equal(matchupKeyFromSigs(teamPlayerSig(['a', 'b']), teamPlayerSig(['c', 'd'])), 'a,b|c,d');
}

/**
 * After swap, historical fixture sig must resolve via alias map to current franchise tid,
 * otherwise RR matchup history drops past games.
 */
function testAliasBackedTidResolution(): void {
  const oldIds = ['injured', 'partner'];
  const newIds = ['replacement', 'partner'];
  const tid = 'franchise-team-1';
  const sigToTid = new Map([[teamPlayerSig(newIds), tid]]);
  const aliasKeyToTid = new Map([[sortedPlayerKey(oldIds), tid]]);

  const resolveTid = (playerIds: string[]): string | null => {
    const current = sigToTid.get(teamPlayerSig(playerIds));
    if (current) return current;
    return aliasKeyToTid.get(sortedPlayerKey(playerIds)) ?? null;
  };

  assert.equal(resolveTid(newIds), tid);
  assert.equal(resolveTid(oldIds), tid);
  assert.equal(resolveTid(['x', 'y']), null);
}

testSortedPlayerKeyStable();
testRostersEqualIgnoresOrder();
testFranchiseMatchOnPartialRoster();
testSigAndRosterKeyAlignment();
testAliasBackedTidResolution();
console.log('leagueTeamPlayerSwap helpers: ok');
