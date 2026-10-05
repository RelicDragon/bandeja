/**
 * Pair rivalries — pure, no Prisma, no I/O.
 *
 * "Which opposing pairs have these two faced most, and how did it go?"
 *
 * Input is one game the pair already counted for (a same-side pair game per
 * `detectPairGameFacts`). Meetings are read **per match**: a match counts when
 * the two stood on the same two-player team and the other team in that match
 * was also exactly two players. That is the only reading that stays honest in
 * a multi-court format, where a fixed duo meets several pairs in one game and
 * the game-level outcome says nothing about any single one of them.
 *
 * A meeting is a win when `Match.winnerId` is the pair's team, a loss when it
 * is the opponents', and neither (counted only as a meeting) when the match has
 * no winner — a draw or an unscored match.
 *
 * Fixed-team games with no recorded matches fall back to the two fixed teams
 * and the game outcome (`GameOutcome.isWinner`).
 */

import { orderPairIds, pairKey, type PairIds } from './pairKey';

export interface RivalryMatchTeam {
  id: string;
  playerIds: string[];
}

export interface RivalryMatch {
  teams: RivalryMatchTeam[];
  winnerTeamId: string | null;
}

export interface RivalryGame {
  gameId: string;
  playedAt: Date;
  hasFixedTeams: boolean;
  fixedTeams: { playerIds: string[] }[];
  matches: RivalryMatch[];
  winnerUserIds: string[];
}

export interface RivalryMeeting extends PairIds {
  gameId: string;
  playedAt: Date;
  result: 'win' | 'loss' | 'none';
}

export interface RivalryTotals extends PairIds {
  meetings: number;
  wins: number;
  losses: number;
  /** Distinct games in which the pairs met. */
  games: number;
  lastMetAt: Date;
}

export const PAIR_RIVALRY_LIMIT = 3;

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))];
}

function isExactlyPair(ids: readonly string[], a: string, b: string): boolean {
  const unique = uniqueIds(ids);
  return unique.length === 2 && unique.includes(a) && unique.includes(b);
}

function opposingPair(ids: readonly string[], pair: PairIds): PairIds | null {
  const unique = uniqueIds(ids);
  if (unique.length !== 2) return null;
  if (unique.includes(pair.userAId) || unique.includes(pair.userBId)) return null;
  return orderPairIds(unique[0]!, unique[1]!);
}

/** Every meeting this game contains between `pair` and another two-player pair. */
export function collectRivalryMeetings(game: RivalryGame, pair: PairIds): RivalryMeeting[] {
  const out: RivalryMeeting[] = [];

  for (const match of game.matches) {
    const ours = match.teams.find((team) => isExactlyPair(team.playerIds, pair.userAId, pair.userBId));
    if (!ours) continue;
    for (const team of match.teams) {
      if (team.id === ours.id) continue;
      const opponents = opposingPair(team.playerIds, pair);
      if (!opponents) continue;
      let result: RivalryMeeting['result'] = 'none';
      if (match.winnerTeamId === ours.id) result = 'win';
      else if (match.winnerTeamId === team.id) result = 'loss';
      out.push({ ...opponents, gameId: game.gameId, playedAt: game.playedAt, result });
    }
  }

  if (out.length > 0 || game.matches.length > 0) return out;

  // No recorded matches: two fixed teams and the game outcome.
  if (game.hasFixedTeams && game.fixedTeams.length === 2) {
    const oursIndex = game.fixedTeams.findIndex((team) =>
      isExactlyPair(team.playerIds, pair.userAId, pair.userBId),
    );
    if (oursIndex < 0) return out;
    const opponents = opposingPair(game.fixedTeams[1 - oursIndex]!.playerIds, pair);
    if (!opponents) return out;
    const winners = new Set(game.winnerUserIds);
    let result: RivalryMeeting['result'] = 'none';
    if (winners.has(pair.userAId) && winners.has(pair.userBId)) result = 'win';
    else if (winners.has(opponents.userAId) && winners.has(opponents.userBId)) result = 'loss';
    out.push({ ...opponents, gameId: game.gameId, playedAt: game.playedAt, result });
  }

  return out;
}

/**
 * Sum meetings per opposing pair and keep the top `limit`: most meetings, then
 * most distinct games, then most recent, then ids — a total, stable order.
 */
export function rankRivalries(
  meetings: readonly RivalryMeeting[],
  limit: number = PAIR_RIVALRY_LIMIT,
): RivalryTotals[] {
  const byPair = new Map<string, RivalryTotals & { gameIds: Set<string> }>();

  for (const meeting of meetings) {
    const key = pairKey(meeting.userAId, meeting.userBId);
    let entry = byPair.get(key);
    if (!entry) {
      entry = {
        userAId: meeting.userAId,
        userBId: meeting.userBId,
        meetings: 0,
        wins: 0,
        losses: 0,
        games: 0,
        lastMetAt: meeting.playedAt,
        gameIds: new Set(),
      };
      byPair.set(key, entry);
    }
    entry.meetings += 1;
    if (meeting.result === 'win') entry.wins += 1;
    if (meeting.result === 'loss') entry.losses += 1;
    entry.gameIds.add(meeting.gameId);
    entry.games = entry.gameIds.size;
    if (meeting.playedAt.getTime() > entry.lastMetAt.getTime()) entry.lastMetAt = meeting.playedAt;
  }

  return [...byPair.values()]
    .sort((a, b) => {
      if (a.meetings !== b.meetings) return b.meetings - a.meetings;
      if (a.games !== b.games) return b.games - a.games;
      if (a.lastMetAt.getTime() !== b.lastMetAt.getTime()) {
        return b.lastMetAt.getTime() - a.lastMetAt.getTime();
      }
      return pairKey(a.userAId, a.userBId) < pairKey(b.userAId, b.userBId) ? -1 : 1;
    })
    .slice(0, Math.max(0, limit))
    .map((entry) => ({
      userAId: entry.userAId,
      userBId: entry.userBId,
      meetings: entry.meetings,
      wins: entry.wins,
      losses: entry.losses,
      games: entry.games,
      lastMetAt: entry.lastMetAt,
    }));
}
