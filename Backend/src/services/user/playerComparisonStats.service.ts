import { MatchSetRole } from '@prisma/client';
import { isRelationshipInsightMatch } from './userPerformanceInsights.service';

export type ComparisonRelationshipStats = {
  total: number;
  wins: number;
  losses: number;
  ties: number;
};

export type ComparisonRelationshipKind = 'together' | 'against';
export type ComparisonRelationshipMode = ComparisonRelationshipKind | 'auto';

export type ComparisonMatchInput = {
  winnerId: string | null;
  sets: Array<{
    teamAScore: number;
    teamBScore: number;
    role: MatchSetRole | string;
  }>;
  teams: Array<{
    id: string;
    players: Array<{ userId: string }>;
  }>;
};

export type ComparisonRelationshipBuckets = {
  together: ComparisonRelationshipStats;
  against: ComparisonRelationshipStats;
};

export function emptyComparisonRelationshipStats(): ComparisonRelationshipStats {
  return { total: 0, wins: 0, losses: 0, ties: 0 };
}

function recordOutcome(
  stats: ComparisonRelationshipStats,
  winnerTeamId: string | null,
  currentUserTeamId: string,
  otherUserTeamId: string | null,
) {
  stats.total += 1;
  if (winnerTeamId === currentUserTeamId) {
    stats.wins += 1;
  } else if (otherUserTeamId && winnerTeamId === otherUserTeamId) {
    stats.losses += 1;
  } else if (winnerTeamId) {
    stats.losses += 1;
  } else {
    stats.ties += 1;
  }
}

export function addScoredComparisonMatchStats(
  buckets: ComparisonRelationshipBuckets,
  currentUserId: string,
  otherUserId: string,
  match: ComparisonMatchInput,
  mode: ComparisonRelationshipMode = 'auto',
): ComparisonRelationshipKind | null {
  if (!isRelationshipInsightMatch(match)) return null;

  const currentUserTeam = match.teams.find((team) =>
    team.players.some((player) => player.userId === currentUserId),
  );
  const otherUserTeam = match.teams.find((team) =>
    team.players.some((player) => player.userId === otherUserId),
  );
  if (!currentUserTeam || !otherUserTeam) return null;

  const relationship: ComparisonRelationshipKind | null = mode === 'auto'
    ? currentUserTeam.id === otherUserTeam.id ? 'together' : 'against'
    : mode;

  if (relationship === 'against' && currentUserTeam.id === otherUserTeam.id) {
    return null;
  }

  recordOutcome(
    buckets[relationship],
    match.winnerId,
    currentUserTeam.id,
    relationship === 'against' ? otherUserTeam.id : null,
  );
  return relationship;
}

