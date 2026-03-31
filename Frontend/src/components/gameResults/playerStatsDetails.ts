import { Round, SetResult } from '@/types/gameResults';

export interface PlayerMatchDetail {
  matchId: string;
  roundNumber: number;
  matchNumber: number;
  setsSummary: string;
  result: 'W' | 'L' | 'T' | null;
}

function formatSetsSummary(
  sets: SetResult[],
  isInTeamA: boolean
): string {
  if (!sets || sets.length === 0) return '—';

  const hasAnyScore = sets.some((set) => set.teamA > 0 || set.teamB > 0);
  if (!hasAnyScore) return '—';

  return sets
    .map((set) => {
      const myScore = isInTeamA ? set.teamA : set.teamB;
      const oppScore = isInTeamA ? set.teamB : set.teamA;
      return `${myScore}-${oppScore}${set.isTieBreak ? ' TB' : ''}`;
    })
    .join(' · ');
}

function resolveMatchResult(
  sets: SetResult[],
  isInTeamA: boolean
): 'W' | 'L' | 'T' | null {
  if (!sets || sets.length === 0) return null;

  let wonSets = 0;
  let lostSets = 0;

  for (const set of sets) {
    const myScore = isInTeamA ? set.teamA : set.teamB;
    const oppScore = isInTeamA ? set.teamB : set.teamA;
    if (myScore > oppScore) wonSets += 1;
    if (myScore < oppScore) lostSets += 1;
  }

  if (wonSets === 0 && lostSets === 0) return null;
  if (wonSets > lostSets) return 'W';
  if (lostSets > wonSets) return 'L';
  return 'T';
}

export function buildPlayerMatchDetails(rounds: Round[], playerId: string): PlayerMatchDetail[] {
  const details: PlayerMatchDetail[] = [];

  rounds.forEach((round, roundIdx) => {
    round.matches.forEach((match, matchIdx) => {
      const inTeamA = match.teamA.includes(playerId);
      const inTeamB = match.teamB.includes(playerId);
      if (!inTeamA && !inTeamB) return;

      const isInTeamA = inTeamA;
      details.push({
        matchId: match.id,
        roundNumber: roundIdx + 1,
        matchNumber: matchIdx + 1,
        setsSummary: formatSetsSummary(match.sets, isInTeamA),
        result: resolveMatchResult(match.sets, isInTeamA),
      });
    });
  });

  return details;
}
