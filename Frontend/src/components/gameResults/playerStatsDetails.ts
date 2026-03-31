import { Round, SetResult } from '@/types/gameResults';

export interface PlayerSetDetail {
  myScore: number;
  oppScore: number;
  isTieBreak: boolean;
}

export interface PlayerMatchDetail {
  matchId: string;
  roundNumber: number;
  matchNumber: number;
  setsSummary: string;
  result: 'W' | 'L' | 'T' | null;
  teamAPlayers: string[];
  teamBPlayers: string[];
  sets: PlayerSetDetail[];
}

function getPlayedSets(sets: SetResult[]): SetResult[] {
  return sets.filter((set) => !(set.teamA === 0 && set.teamB === 0));
}

function formatSetsSummary(
  sets: PlayerSetDetail[]
): string {
  if (!sets || sets.length === 0) return '';

  return sets
    .map((set) => {
      return `${set.myScore}-${set.oppScore}${set.isTieBreak ? ' TB' : ''}`;
    })
    .join(' · ');
}

function resolveMatchResult(
  sets: PlayerSetDetail[]
): 'W' | 'L' | 'T' | null {
  if (!sets || sets.length === 0) return null;

  let wonSets = 0;
  let lostSets = 0;

  for (const set of sets) {
    if (set.myScore > set.oppScore) wonSets += 1;
    if (set.myScore < set.oppScore) lostSets += 1;
  }

  if (wonSets === 0 && lostSets === 0) return null;
  if (wonSets > lostSets) return 'W';
  if (lostSets > wonSets) return 'L';
  return 'T';
}

function buildSetDetails(sets: SetResult[], isInTeamA: boolean): PlayerSetDetail[] {
  return getPlayedSets(sets).map((set) => ({
    myScore: isInTeamA ? set.teamA : set.teamB,
    oppScore: isInTeamA ? set.teamB : set.teamA,
    isTieBreak: !!set.isTieBreak,
  }));
}

function resolvePlayerName(playerId: string, playerNameById: Record<string, string>): string {
  return playerNameById[playerId] || playerId.slice(0, 8);
}

export function buildPlayerMatchDetails(
  rounds: Round[],
  playerId: string,
  playerNameById: Record<string, string>
): PlayerMatchDetail[] {
  const details: PlayerMatchDetail[] = [];

  rounds.forEach((round, roundIdx) => {
    round.matches.forEach((match, matchIdx) => {
      const inTeamA = match.teamA.includes(playerId);
      const inTeamB = match.teamB.includes(playerId);
      if (!inTeamA && !inTeamB) return;

      const isInTeamA = inTeamA;
      const sets = buildSetDetails(match.sets, isInTeamA);
      const setsSummary = formatSetsSummary(sets);
      if (!setsSummary) return;

      details.push({
        matchId: match.id,
        roundNumber: roundIdx + 1,
        matchNumber: matchIdx + 1,
        setsSummary,
        result: resolveMatchResult(sets),
        teamAPlayers: match.teamA.map((id) => resolvePlayerName(id, playerNameById)),
        teamBPlayers: match.teamB.map((id) => resolvePlayerName(id, playerNameById)),
        sets,
      });
    });
  });

  return details;
}
