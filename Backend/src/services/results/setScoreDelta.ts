export interface SetLike {
  teamAScore: number;
  teamBScore: number;
  isTieBreak?: boolean;
}

export function getSetScoreForDelta(set: SetLike, teamNumber: 1 | 2): number {
  if (set.isTieBreak) {
    const aWon = set.teamAScore > set.teamBScore;
    return teamNumber === 1 ? (aWon ? 1 : 0) : (aWon ? 0 : 1);
  }
  return teamNumber === 1 ? set.teamAScore : set.teamBScore;
}

export function getMatchScoresForDelta(sets: SetLike[]): { teamAScore: number; teamBScore: number } {
  let teamAScore = 0;
  let teamBScore = 0;
  for (const set of sets) {
    teamAScore += getSetScoreForDelta(set, 1);
    teamBScore += getSetScoreForDelta(set, 2);
  }
  return { teamAScore, teamBScore };
}
