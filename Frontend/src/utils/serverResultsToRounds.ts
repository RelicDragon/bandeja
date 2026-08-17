import { createId } from '@paralleldrive/cuid2';
import type { Match, Round, SetResult } from '@/types/gameResults';
import { parseMatchSetRole } from '@/utils/matchSetRole';
import { buildSnapshotFromServerMatch } from '@/utils/matchTimer';

type ServerTeam = {
  id?: string;
  teamNumber?: number;
  playerIds?: string[];
  players?: Array<{ userId?: string; user?: { id?: string } }>;
};

type ServerSet = {
  teamAScore?: number;
  teamA?: number;
  teamBScore?: number;
  teamB?: number;
  isTieBreak?: boolean;
  role?: string;
};

type ServerMatch = {
  id?: string;
  winnerId?: string;
  courtId?: string;
  teams?: ServerTeam[];
  sets?: ServerSet[];
  timerStatus?: string;
  timerStartedAt?: string | Date | null;
  timerPausedAt?: string | Date | null;
  timerElapsedMs?: number;
  timerCapMinutes?: number | null;
};

type ServerRound = {
  id?: string;
  matches?: ServerMatch[];
};

export function convertServerResultsToRounds(
  serverResults: { rounds?: ServerRound[] } | null | undefined,
): Round[] {
  if (!serverResults?.rounds || !Array.isArray(serverResults.rounds)) return [];

  return serverResults.rounds.map((round) => {
    const matches: Match[] = [];
    if (round.matches && Array.isArray(round.matches)) {
      for (const match of round.matches) {
        matches.push(convertServerMatch(match));
      }
    }
    return {
      id: round.id || createId(),
      matches,
    };
  });
}

function convertServerMatch(match: ServerMatch): Match {
  const teamA: string[] = [];
  const teamB: string[] = [];

  if (match.teams && Array.isArray(match.teams)) {
    for (const team of match.teams) {
      const playerIds =
        team.playerIds ||
        (team.players || [])
          .map((p) => p.userId || p.user?.id)
          .filter((id): id is string => Boolean(id));
      if (team.teamNumber === 1 && playerIds.length > 0) {
        teamA.push(...playerIds);
      } else if (team.teamNumber === 2 && playerIds.length > 0) {
        teamB.push(...playerIds);
      }
    }
  }

  const sets: SetResult[] =
    match.sets && Array.isArray(match.sets) && match.sets.length > 0
      ? match.sets.map((s) => ({
          teamA: s.teamAScore ?? s.teamA ?? 0,
          teamB: s.teamBScore ?? s.teamB ?? 0,
          isTieBreak: s.isTieBreak || false,
          role: parseMatchSetRole(s.role),
        }))
      : [{ teamA: 0, teamB: 0, isTieBreak: false }];

  let winnerTeam: 'teamA' | 'teamB' | null = null;
  if (match.winnerId) {
    const teamAId = match.teams?.find((t) => t.teamNumber === 1)?.id;
    const teamBId = match.teams?.find((t) => t.teamNumber === 2)?.id;
    if (match.winnerId === teamAId) {
      winnerTeam = 'teamA';
    } else if (match.winnerId === teamBId) {
      winnerTeam = 'teamB';
    }
  }

  const timer = buildSnapshotFromServerMatch(match);
  return {
    id: match.id || createId(),
    teamA,
    teamB,
    sets,
    winnerId: winnerTeam,
    courtId: match.courtId,
    ...(timer ? { timer } : {}),
  };
}

export function pendingLeagueFixtureMatch(
  gameId: string,
  teamA: string[],
  teamB: string[],
): Match {
  return {
    id: `pending-${gameId}`,
    teamA,
    teamB,
    sets: [],
  };
}
