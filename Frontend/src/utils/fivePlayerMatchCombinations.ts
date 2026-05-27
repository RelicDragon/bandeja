import type { Round } from '@/types/gameResults';

export type FivePlayerMatchCombination = {
  teamA: [string, string];
  teamB: [string, string];
};

export function buildFivePlayerAllMatchCombinations(playerIds: string[]): FivePlayerMatchCombination[] {
  if (playerIds.length !== 5) return [];

  const matches: FivePlayerMatchCombination[] = [];
  for (let excluded = 0; excluded < 5; excluded += 1) {
    const playing = playerIds.filter((_, index) => index !== excluded);
    const [p0, p1, p2, p3] = playing;
    matches.push(
      { teamA: [p0, p1], teamB: [p2, p3] },
      { teamA: [p0, p2], teamB: [p1, p3] },
      { teamA: [p0, p3], teamB: [p1, p2] },
    );
  }
  return matches;
}

export function isMatchEmpty(match: Round['matches'][number]): boolean {
  const hasTeams = match.teamA.length > 0 || match.teamB.length > 0;
  const hasScores = match.sets?.some((set) => set.teamA > 0 || set.teamB > 0);
  return !hasTeams && !hasScores;
}

export function shouldShowRoundAddedModal(round: Round | null | undefined): boolean {
  if (!round?.matches?.length) return false;
  if (round.matches.length === 1 && isMatchEmpty(round.matches[0])) return false;
  return true;
}

export function canCreateAllFivePlayerCombinations(
  playerCount: number,
  hasFixedTeams: boolean,
  rounds: Round[],
): boolean {
  if (playerCount !== 5 || hasFixedTeams) return false;
  if (rounds.length === 0) return true;
  if (rounds.length !== 1) return false;

  const round = rounds[0];
  if (round.matches.length === 0) return true;
  return round.matches.length === 1 && isMatchEmpty(round.matches[0]);
}
