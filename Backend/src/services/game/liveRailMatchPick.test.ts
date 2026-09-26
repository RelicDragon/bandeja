/**
 * Which games earn a rail card without a live score, and which match it shows.
 * Pure: no DB.
 *
 * Run: `ts-node --transpile-only src/services/game/liveRailMatchPick.test.ts`
 */
import assert from 'node:assert/strict';
import {
  earnsRailCard,
  isStandingsFormat,
  pickFinishedRailMatch,
  pickProgressRailMatch,
  railMatchPosition,
  type RailMatchCandidate,
} from './liveRailMatchPick';

function match(
  id: string,
  roundNumber: number,
  matchNumber: number,
  scored: boolean,
  playerIds: string[] = ['a', 'b', 'c', 'd'],
): RailMatchCandidate {
  return { id, roundNumber, matchNumber, scored, hasBothTeams: true, playerIds };
}

/* ---------------- formats ---------------- */
{
  assert.equal(isStandingsFormat({ entityType: 'GAME', gameType: 'CLASSIC' }), false);
  assert.equal(isStandingsFormat({ entityType: 'GAME', gameType: 'CUSTOM' }), false);
  assert.equal(isStandingsFormat({ entityType: 'LEAGUE', gameType: 'CLASSIC' }), false);
  assert.equal(isStandingsFormat({ entityType: 'GAME', gameType: 'AMERICANO' }), true);
  assert.equal(isStandingsFormat({ entityType: 'TOURNAMENT', gameType: 'CLASSIC' }), true);
  assert.equal(isStandingsFormat({ entityType: 'TOURNAMENT', gameType: 'ROUND_ROBIN' }), true);
}

/* ---------------- who earns a card ---------------- */
{
  const base = { isLeagueFixture: false, standingsFormat: false, focusPlaying: false };
  assert.equal(earnsRailCard(base), true, 'a game with a scoreline, any match count');
  assert.equal(earnsRailCard({ ...base, standingsFormat: true }), false, 'a stranger\'s tournament');
  assert.equal(
    earnsRailCard({ ...base, standingsFormat: true, focusPlaying: true }),
    true,
    'a tournament someone the viewer follows is playing',
  );
  assert.equal(earnsRailCard({ ...base, isLeagueFixture: true, standingsFormat: true }), true, 'league: always');
}

/* ---------------- finished: the last scored match ---------------- */
{
  // Rotating partners, three matches, the third one left blank.
  const matches = [match('m3', 1, 3, false), match('m1', 1, 1, true), match('m2', 1, 2, true)];
  assert.equal(pickFinishedRailMatch(matches, new Set())?.id, 'm2');
  assert.equal(pickFinishedRailMatch([match('x', 1, 1, false)], new Set()), null, 'nothing scored');

  // A tournament: the followed player's last match, not the event's last one.
  const event = [
    match('r1a', 1, 1, true, ['f', 'b', 'c', 'd']),
    match('r1b', 1, 2, true, ['e', 'g', 'h', 'i']),
    match('r2a', 2, 1, true, ['f', 'c', 'b', 'd']),
    match('r2b', 2, 2, true, ['e', 'g', 'h', 'i']),
  ];
  assert.equal(pickFinishedRailMatch(event, new Set(['f']))?.id, 'r2a');
  // The focus narrows, never empties: nobody followed on court → event's last.
  assert.equal(pickFinishedRailMatch(event, new Set(['zz']))?.id, 'r2b');

  // A match with one side missing has no rows to draw.
  const half = { ...match('h', 1, 2, true), hasBothTeams: false };
  assert.equal(pickFinishedRailMatch([match('ok', 1, 1, true), half], new Set())?.id, 'ok');
}

/* ---------------- in progress: latest entered, else next up ---------------- */
{
  const event = [
    match('r1a', 1, 1, true, ['e', 'g', 'h', 'i']),
    match('r1b', 1, 2, false, ['f', 'b', 'c', 'd']),
    match('r2a', 2, 1, false, ['f', 'c', 'b', 'd']),
  ];
  // The followed player has nothing entered yet: their next match, not a stranger's result.
  assert.equal(pickProgressRailMatch(event, new Set(['f']))?.id, 'r1b');
  // No focus: the latest entered result.
  assert.equal(pickProgressRailMatch(event, new Set())?.id, 'r1a');
  // Nothing entered at all: the first match.
  assert.equal(
    pickProgressRailMatch([match('b', 1, 2, false), match('a', 1, 1, false)], new Set())?.id,
    'a',
  );
  assert.equal(pickProgressRailMatch([], new Set()), null);
}

/* ---------------- position label ---------------- */
{
  const three = [match('m1', 1, 1, true), match('m2', 1, 2, true), match('m3', 1, 3, true)];
  assert.deepEqual(railMatchPosition(three, 'm3', false), { kind: 'match', index: 3, count: 3 });
  assert.deepEqual(railMatchPosition(three, 'm2', true), { kind: 'round', round: 1 });
  assert.equal(railMatchPosition([match('solo', 1, 1, true)], 'solo', false), null, 'single match');
  assert.equal(railMatchPosition(three, 'missing', false), null);
}

console.log('liveRailMatchPick.test.ts: ok');
