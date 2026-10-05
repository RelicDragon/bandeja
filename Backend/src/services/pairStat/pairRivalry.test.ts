/**
 * Pair rivalries — per-match meetings between the pair and other two-player pairs.
 */

import { collectRivalryMeetings, rankRivalries, type RivalryGame, type RivalryMeeting } from './pairRivalry';
import { orderPairIds } from './pairKey';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const PAIR = orderPairIds('a', 'b');

function at(day: number): Date {
  return new Date(Date.UTC(2026, 0, day, 12));
}

function match(us: string[], them: string[], winner: 'us' | 'them' | null, n = 0) {
  return {
    teams: [
      { id: `us-${n}`, playerIds: us },
      { id: `them-${n}`, playerIds: them },
    ],
    winnerTeamId: winner === 'us' ? `us-${n}` : winner === 'them' ? `them-${n}` : null,
  };
}

function g(id: string, day: number, matches: RivalryGame['matches'], extra: Partial<RivalryGame> = {}): RivalryGame {
  return {
    gameId: id,
    playedAt: at(day),
    hasFixedTeams: false,
    fixedTeams: [],
    matches,
    winnerUserIds: [],
    ...extra,
  };
}

// Classic 2v2: one match, win / loss / draw.
{
  const m = collectRivalryMeetings(g('g1', 1, [match(['a', 'b'], ['c', 'd'], 'us')]), PAIR);
  assert(m.length === 1, 'one meeting');
  assert(m[0]!.userAId === 'c' && m[0]!.userBId === 'd', 'opponents ordered');
  assert(m[0]!.result === 'win', 'win');
  const loss = collectRivalryMeetings(g('g2', 2, [match(['b', 'a'], ['d', 'c'], 'them')]), PAIR);
  assert(loss[0]!.result === 'loss', 'loss, order-insensitive');
  const draw = collectRivalryMeetings(g('g3', 3, [match(['a', 'b'], ['c', 'd'], null)]), PAIR);
  assert(draw[0]!.result === 'none', 'no winner → meeting only');
}

// Matches where the two were split, or opponents are not exactly two, never count.
{
  const m = collectRivalryMeetings(
    g('g4', 4, [
      match(['a', 'c'], ['b', 'd'], 'us', 1),
      match(['a', 'b'], ['e'], 'us', 2),
      match(['a', 'b', 'x'], ['c', 'd'], 'us', 3),
      match(['a', 'b'], ['e', 'f'], 'them', 4),
    ]),
    PAIR,
  );
  assert(m.length === 1, `only the clean 2v2 counts, got ${m.length}`);
  assert(m[0]!.userAId === 'e' && m[0]!.result === 'loss', 'e & f loss');
}

// Multi-court game: a fixed duo meets several pairs in one game.
{
  const m = collectRivalryMeetings(
    g('g5', 5, [
      match(['a', 'b'], ['c', 'd'], 'us', 1),
      match(['a', 'b'], ['e', 'f'], 'them', 2),
      match(['g', 'h'], ['c', 'd'], 'us', 3),
    ]),
    PAIR,
  );
  assert(m.length === 2, 'two opponents met');
}

// Fixed teams without matches fall back to the game outcome.
{
  const base = { hasFixedTeams: true, fixedTeams: [{ playerIds: ['a', 'b'] }, { playerIds: ['c', 'd'] }] };
  const won = collectRivalryMeetings(g('g6', 6, [], { ...base, winnerUserIds: ['a', 'b'] }), PAIR);
  assert(won.length === 1 && won[0]!.result === 'win', 'fixed fallback win');
  const lost = collectRivalryMeetings(g('g7', 7, [], { ...base, winnerUserIds: ['c', 'd'] }), PAIR);
  assert(lost[0]!.result === 'loss', 'fixed fallback loss');
  const three = collectRivalryMeetings(
    g('g8', 8, [], { hasFixedTeams: true, fixedTeams: [{ playerIds: ['a', 'b'] }, { playerIds: ['c', 'd'] }, { playerIds: ['e', 'f'] }] }),
    PAIR,
  );
  assert(three.length === 0, 'more than two fixed teams → no fallback');
}

// Ranking: most meetings first, W–L summed, top 3, recency breaks ties.
{
  const meet = (opp: [string, string], day: number, result: RivalryMeeting['result'], gameId = `g${day}`): RivalryMeeting => ({
    ...orderPairIds(opp[0], opp[1]),
    gameId,
    playedAt: at(day),
    result,
  });
  const meetings: RivalryMeeting[] = [
    meet(['c', 'd'], 1, 'win'),
    meet(['c', 'd'], 2, 'loss'),
    meet(['c', 'd'], 3, 'loss'),
    meet(['c', 'd'], 3, 'none', 'g3'),
    meet(['e', 'f'], 4, 'win'),
    meet(['e', 'f'], 5, 'win'),
    meet(['g', 'h'], 6, 'loss'),
    meet(['i', 'j'], 9, 'win'),
    meet(['k', 'l'], 1, 'win'),
  ];
  const top = rankRivalries(meetings);
  assert(top.length === 3, 'top 3');
  assert(top[0]!.userAId === 'c', 'most meetings first');
  assert(top[0]!.meetings === 4 && top[0]!.wins === 1 && top[0]!.losses === 2, 'W–L summed, draw only a meeting');
  assert(top[0]!.games === 3, 'distinct games');
  assert(top[0]!.lastMetAt.getTime() === at(3).getTime(), 'last met');
  assert(top[1]!.userAId === 'e', 'second');
  assert(top[2]!.userAId === 'i', 'recency breaks the 1-meeting tie');
  assert(rankRivalries([]).length === 0, 'empty');
}

console.log('pairRivalry.test.ts OK');
