import type { Match, Round } from '@/types/gameResults';
import {
  expandSetsForDisplay,
  getStandingsMatchOutcome,
  isClassicRules,
  isResultsMatchFinished,
  type ScoringRules,
} from '@/utils/scoring';
import { isSupplementalMatchSet } from '@/utils/matchSetRole';
import { teamSideSlotsFull } from '@/utils/matchFormat';

export type ResultsTeam = 'teamA' | 'teamB';

export interface ScoreEntryTarget {
  roundId: string;
  matchId: string;
  setIndex: number;
}

export interface MatchLineupUpdate {
  matchId: string;
  teamA: string[];
  teamB: string[];
}

export interface ResultsMatchRef {
  roundId: string;
  roundNumber: number;
  matchId: string;
  matchNumber: number;
}

export interface ResultsProgressSummary {
  total: number;
  finished: number;
  unscored: ResultsMatchRef[];
  incompleteLineups: ResultsMatchRef[];
  ties: number;
}

export const otherTeam = (team: ResultsTeam): ResultsTeam => (team === 'teamA' ? 'teamB' : 'teamA');

export function isMatchLineupFull(match: Pick<Match, 'teamA' | 'teamB'>, maxPerTeam: number): boolean {
  return teamSideSlotsFull(match, 'teamA', maxPerTeam) && teamSideSlotsFull(match, 'teamB', maxPerTeam);
}

/** The team the next tapped player goes to: the preferred side while it has room, else the first open side. */
export function resolveLineupTargetTeam(
  match: Pick<Match, 'teamA' | 'teamB'>,
  preferred: ResultsTeam | null,
  maxPerTeam: number,
): ResultsTeam | null {
  if (preferred && match[preferred].length < maxPerTeam) return preferred;
  if (match.teamA.length < maxPerTeam) return 'teamA';
  if (match.teamB.length < maxPerTeam) return 'teamB';
  return null;
}

/**
 * Index of the set the scorer fills in next, using the same display rows the
 * match card turns into tiles (so it may point one past `match.sets`).
 */
export function nextEntrySetIndex(match: Pick<Match, 'sets'>, rules: ScoringRules): number | null {
  const display = expandSetsForDisplay(match.sets, rules, { canEditResults: true });
  const index = display.findIndex(
    (set) => !isSupplementalMatchSet(set) && set.teamA === 0 && set.teamB === 0,
  );
  if (index < 0) return null;
  if (!isClassicRules(rules) && isResultsMatchFinished(match, rules)) return null;
  return index;
}

/**
 * Next match that is ready to score (full lineup, rows left to fill), starting
 * at `from` (inclusive, so a multi-set match continues) and wrapping around.
 */
export function findNextScoreTarget(
  rounds: Round[],
  rules: ScoringRules,
  maxPerTeam: number,
  from: { matchId: string } | null,
): ScoreEntryTarget | null {
  const flat = rounds.flatMap((round) => round.matches.map((match) => ({ roundId: round.id, match })));
  if (flat.length === 0) return null;
  const found = from ? flat.findIndex((entry) => entry.match.id === from.matchId) : 0;
  const start = found < 0 ? 0 : found;
  for (let step = 0; step < flat.length; step++) {
    const { roundId, match } = flat[(start + step) % flat.length];
    if (!isMatchLineupFull(match, maxPerTeam)) continue;
    const setIndex = nextEntrySetIndex(match, rules);
    if (setIndex === null) continue;
    return { roundId, matchId: match.id, setIndex };
  }
  return null;
}

/** Whether "Save and next" can lead anywhere once the current row is saved. */
export function canAdvanceAfterSave(
  rounds: Round[],
  rules: ScoringRules,
  maxPerTeam: number,
  currentMatchId: string,
): boolean {
  const others = rounds.map((round) => ({
    ...round,
    matches: round.matches.filter((match) => match.id !== currentMatchId),
  }));
  if (findNextScoreTarget(others, rules, maxPerTeam, null)) return true;
  return isClassicRules(rules) && rules.fixedNumberOfSets !== 1;
}

/** Open the round that still needs work, else the last one. */
export function pickInitialExpandedRoundIds(rounds: Round[], rules: ScoringRules): string[] {
  const open = rounds.find((round) => round.matches.some((match) => !isResultsMatchFinished(match, rules)));
  const target = open ?? rounds[rounds.length - 1];
  return target ? [target.id] : [];
}

export function roundMatchProgress(round: Round, rules: ScoringRules): { finished: number; total: number } {
  return {
    total: round.matches.length,
    finished: round.matches.filter((match) => isResultsMatchFinished(match, rules)).length,
  };
}

export function summarizeResultsProgress(
  rounds: Round[],
  rules: ScoringRules,
  maxPerTeam: number,
): ResultsProgressSummary {
  const summary: ResultsProgressSummary = { total: 0, finished: 0, unscored: [], incompleteLineups: [], ties: 0 };
  rounds.forEach((round, roundIndex) => {
    round.matches.forEach((match, matchIndex) => {
      summary.total += 1;
      const ref: ResultsMatchRef = {
        roundId: round.id,
        roundNumber: roundIndex + 1,
        matchId: match.id,
        matchNumber: matchIndex + 1,
      };
      if (isResultsMatchFinished(match, rules)) {
        summary.finished += 1;
        if (getStandingsMatchOutcome(match.sets, rules) === 'tie') summary.ties += 1;
      } else if (isMatchLineupFull(match, maxPerTeam)) {
        summary.unscored.push(ref);
      } else {
        summary.incompleteLineups.push(ref);
      }
    });
  });
  return summary;
}

export function playerIdsInRound(round: Pick<Round, 'matches'>): Set<string> {
  const ids = new Set<string>();
  for (const match of round.matches) {
    match.teamA.forEach((id) => ids.add(id));
    match.teamB.forEach((id) => ids.add(id));
  }
  return ids;
}

/** Roster players who sit this round out. Empty until someone has been placed. */
export function getRestingPlayerIds(round: Pick<Round, 'matches'>, rosterIds: string[]): string[] {
  const inRound = playerIdsInRound(round);
  if (inRound.size === 0) return [];
  return rosterIds.filter((id) => !inRound.has(id));
}

export function moveToOtherTeam(
  match: Pick<Match, 'id' | 'teamA' | 'teamB'>,
  team: ResultsTeam,
  playerId: string,
  maxPerTeam: number,
): MatchLineupUpdate | null {
  const target = otherTeam(team);
  if (!match[team].includes(playerId) || match[target].length >= maxPerTeam) return null;
  const next = { teamA: [...match.teamA], teamB: [...match.teamB] };
  next[team] = next[team].filter((id) => id !== playerId);
  next[target] = [...next[target], playerId];
  return { matchId: match.id, ...next };
}

/**
 * Exchange two players' seats inside one round. The second player may sit in
 * the same match, another match of the round, or rest (then they take the seat).
 */
export function swapPlayersInRound(
  round: Pick<Round, 'matches'>,
  source: { matchId: string; team: ResultsTeam; playerId: string },
  otherPlayerId: string,
): MatchLineupUpdate[] {
  if (source.playerId === otherPlayerId) return [];
  const sourceMatch = round.matches.find((match) => match.id === source.matchId);
  if (!sourceMatch) return [];
  const sourceIndex = sourceMatch[source.team].indexOf(source.playerId);
  if (sourceIndex < 0) return [];

  const other = locatePlayerInRound(round, otherPlayerId);
  const replace = (ids: string[], index: number, id: string) => ids.map((value, i) => (i === index ? id : value));

  if (!other) {
    const next = { teamA: [...sourceMatch.teamA], teamB: [...sourceMatch.teamB] };
    next[source.team] = replace(next[source.team], sourceIndex, otherPlayerId);
    return [{ matchId: sourceMatch.id, ...next }];
  }

  if (other.matchId === sourceMatch.id) {
    if (other.team === source.team) return [];
    const next = { teamA: [...sourceMatch.teamA], teamB: [...sourceMatch.teamB] };
    next[source.team] = replace(next[source.team], sourceIndex, otherPlayerId);
    next[other.team] = replace(next[other.team], other.index, source.playerId);
    return [{ matchId: sourceMatch.id, ...next }];
  }

  const otherMatch = round.matches.find((match) => match.id === other.matchId)!;
  const sourceNext = { teamA: [...sourceMatch.teamA], teamB: [...sourceMatch.teamB] };
  sourceNext[source.team] = replace(sourceNext[source.team], sourceIndex, otherPlayerId);
  const otherNext = { teamA: [...otherMatch.teamA], teamB: [...otherMatch.teamB] };
  otherNext[other.team] = replace(otherNext[other.team], other.index, source.playerId);
  return [
    { matchId: sourceMatch.id, ...sourceNext },
    { matchId: otherMatch.id, ...otherNext },
  ];
}

export function locatePlayerInRound(
  round: Pick<Round, 'matches'>,
  playerId: string,
): { matchId: string; team: ResultsTeam; index: number } | null {
  for (const match of round.matches) {
    for (const team of ['teamA', 'teamB'] as const) {
      const index = match[team].indexOf(playerId);
      if (index >= 0) return { matchId: match.id, team, index };
    }
  }
  return null;
}

/** Fill the open seats of one match from `candidateIds`, preferred side first. */
export function autoFillLineup(
  match: Pick<Match, 'id' | 'teamA' | 'teamB'>,
  candidateIds: string[],
  maxPerTeam: number,
  preferred: ResultsTeam = 'teamA',
): MatchLineupUpdate | null {
  const queue = candidateIds.filter((id) => !match.teamA.includes(id) && !match.teamB.includes(id));
  const next = { teamA: [...match.teamA], teamB: [...match.teamB] };
  let changed = false;
  for (const team of [preferred, otherTeam(preferred)]) {
    while (next[team].length < maxPerTeam && queue.length > 0) {
      next[team].push(queue.shift()!);
      changed = true;
    }
  }
  return changed ? { matchId: match.id, ...next } : null;
}

/** Put a removed player back into their old seat, if that is still possible. */
export function restoreRemovedPlayer(
  round: Pick<Round, 'matches'>,
  seat: { matchId: string; team: ResultsTeam; index: number; playerId: string },
  maxPerTeam: number,
): MatchLineupUpdate | null {
  if (playerIdsInRound(round).has(seat.playerId)) return null;
  const match = round.matches.find((m) => m.id === seat.matchId);
  if (!match || match[seat.team].length >= maxPerTeam) return null;
  const next = { teamA: [...match.teamA], teamB: [...match.teamB] };
  const side = next[seat.team];
  side.splice(Math.min(seat.index, side.length), 0, seat.playerId);
  return { matchId: match.id, ...next };
}
