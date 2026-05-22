/** PAR: change ends when a player reaches 11, except at 11–10 (win-by-2 continues). */
export function squashChangeEndsBeforeNextPoint(teamAScore: number, teamBScore: number): boolean {
  const max = Math.max(teamAScore, teamBScore);
  const min = Math.min(teamAScore, teamBScore);
  return max === 11 && min < 10;
}
