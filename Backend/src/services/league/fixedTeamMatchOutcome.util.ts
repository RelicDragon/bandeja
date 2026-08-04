/**
 * Strict winner pick for final fixed-team bracket games.
 * Used by bracket advancement AND podium trophies so both paths never disagree.
 *
 * Rejects incomplete outcomes, multi-winners, ties on set wins, and empty teams.
 */

export type FixedTeamScoreRow = {
  teamNumber: number;
  wins: number;
  isWinner: boolean;
};

export type FixedTeamLike = {
  teamNumber: number;
  players: ReadonlyArray<{ userId: string | null | undefined }>;
};

export type OutcomeLike = {
  userId: string;
  wins?: number | null;
  isWinner?: boolean | null;
};

/** Aggregate outcomes onto fixed-team rows (one score row per team present in outcomes). */
export function buildFixedTeamScoreRows(
  fixedTeams: ReadonlyArray<FixedTeamLike>,
  outcomes: ReadonlyArray<OutcomeLike>
): FixedTeamScoreRow[] {
  const byTeam = new Map<number, FixedTeamScoreRow>();
  for (const outcome of outcomes) {
    const team = fixedTeams.find((t) =>
      t.players.some((p) => p.userId === outcome.userId)
    );
    if (!team) continue;
    const prev = byTeam.get(team.teamNumber) ?? {
      teamNumber: team.teamNumber,
      wins: 0,
      isWinner: false,
    };
    prev.wins += outcome.wins ?? 0;
    if (outcome.isWinner) prev.isWinner = true;
    byTeam.set(team.teamNumber, prev);
  }
  return [...byTeam.values()];
}

/**
 * @returns winning teamNumber, or null when the match is not decisively resolved.
 */
export function pickWinningFixedTeamNumber(params: {
  teamCount: number;
  scores: ReadonlyArray<FixedTeamScoreRow>;
}): number | null {
  const { teamCount, scores } = params;
  if (teamCount < 2 || scores.length !== teamCount) return null;

  const explicitWinners = scores.filter((s) => s.isWinner).map((s) => s.teamNumber);
  if (explicitWinners.length > 1) return null;
  if (explicitWinners.length === 1) return explicitWinners[0] ?? null;

  const bestWins = Math.max(...scores.map((s) => s.wins));
  const bestTeams = scores.filter((s) => s.wins === bestWins).map((s) => s.teamNumber);
  if (bestTeams.length !== 1) return null;
  return bestTeams[0] ?? null;
}

/**
 * Losing side is the only other fixed team when the winner is known.
 * Prefer this over an independent loser ranking so champion/finalist stay coupled.
 */
export function pickLosingFixedTeamNumber(params: {
  teamNumbers: readonly number[];
  winningTeamNumber: number;
}): number | null {
  const others = params.teamNumbers.filter((n) => n !== params.winningTeamNumber);
  return others.length === 1 ? others[0]! : null;
}

/**
 * Pure champion + finalist teamNumbers from one completed fixed-team match.
 */
export function pickChampionAndFinalistTeamNumbers(params: {
  fixedTeams: ReadonlyArray<FixedTeamLike>;
  outcomes: ReadonlyArray<OutcomeLike>;
}): { winningTeamNumber: number; losingTeamNumber: number } | null {
  const scores = buildFixedTeamScoreRows(params.fixedTeams, params.outcomes);
  const winningTeamNumber = pickWinningFixedTeamNumber({
    teamCount: params.fixedTeams.length,
    scores,
  });
  if (winningTeamNumber == null) return null;
  const losingTeamNumber = pickLosingFixedTeamNumber({
    teamNumbers: params.fixedTeams.map((t) => t.teamNumber),
    winningTeamNumber,
  });
  if (losingTeamNumber == null) return null;
  return { winningTeamNumber, losingTeamNumber };
}
