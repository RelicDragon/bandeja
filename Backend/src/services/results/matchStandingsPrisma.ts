import type { MatchSetRole } from '@prisma/client';
import { getRules } from './liveScoringEngine/rulebook';
import { getStandingsMatchOutcome } from './liveScoringEngine/matchWinnerLive';
import type { SetResult } from './liveScoringEngine/types';

export type GameRulesSource = Parameters<typeof getRules>[0];

export function prismaMatchSetsToLiveSets(
  sets: Array<{
    teamAScore: number;
    teamBScore: number;
    isTieBreak?: boolean | null;
    role: MatchSetRole;
    setNumber?: number;
  }>
): SetResult[] {
  const sorted = [...sets].sort((a, b) => (a.setNumber ?? 0) - (b.setNumber ?? 0));
  return sorted.map(s => ({
    teamA: s.teamAScore,
    teamB: s.teamBScore,
    isTieBreak: s.isTieBreak || undefined,
    role: s.role,
  }));
}

export function resolvePrismaMatchWinnerTeamId(
  match: {
    teams: Array<{ id: string; teamNumber: number }>;
    sets: Array<{
      teamAScore: number;
      teamBScore: number;
      isTieBreak?: boolean | null;
      role: MatchSetRole;
    }>;
  },
  game: GameRulesSource
): string | null {
  const rules = getRules(game);
  const liveSets = prismaMatchSetsToLiveSets(match.sets);
  const o = getStandingsMatchOutcome(liveSets, rules);
  if (o !== 'A' && o !== 'B') return null;
  const team1 = match.teams.find(t => t.teamNumber === 1);
  const team2 = match.teams.find(t => t.teamNumber === 2);
  if (o === 'A') return team1?.id ?? null;
  return team2?.id ?? null;
}

export function isPrismaMatchCountedForStandingsAndRating(
  match: {
    sets: Array<{
      teamAScore: number;
      teamBScore: number;
      isTieBreak?: boolean | null;
      role: MatchSetRole;
    }>;
  },
  game: GameRulesSource
): boolean {
  const rules = getRules(game);
  const liveSets = prismaMatchSetsToLiveSets(match.sets);
  return getStandingsMatchOutcome(liveSets, rules) !== null;
}
