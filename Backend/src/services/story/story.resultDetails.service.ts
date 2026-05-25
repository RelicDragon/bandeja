import prisma from '../../config/database';
import type { MatchSetRole } from '@prisma/client';
import { isOfficialMatchSetRole } from '../results/matchSetRole';
import { isPrismaMatchCountedForStandingsAndRating } from '../results/matchStandingsPrisma';

export type StoryResultMatchSet = {
  myScore: number;
  oppScore: number;
  isTieBreak: boolean;
};

export type StoryResultMatchPlayer = {
  userId: string;
  displayName: string;
  avatar: string | null;
};

export type StoryResultMatch = {
  matchId: string;
  roundNumber: number;
  matchNumber: number;
  result: 'W' | 'L' | 'T' | null;
  teamA: StoryResultMatchPlayer[];
  teamB: StoryResultMatchPlayer[];
  sets: StoryResultMatchSet[];
};

type GameForStoryResults = {
  id: string;
  sport: string;
  ballsInGames: boolean | null;
  winnerOfGame: string;
  rounds: Array<{
    roundNumber: number;
    matches: Array<{
      id: string;
      matchNumber: number;
      sets: Array<{
        teamAScore: number;
        teamBScore: number;
        isTieBreak: boolean;
        role: MatchSetRole;
      }>;
      teams: Array<{
        teamNumber: number;
        players: Array<{
          userId: string;
          user: { firstName: string | null; lastName: string | null; avatar: string | null };
        }>;
      }>;
    }>;
  }>;
};

function displayName(user: { firstName: string | null; lastName: string | null }): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || '?';
}

function resolveMatchResult(sets: StoryResultMatchSet[]): 'W' | 'L' | 'T' | null {
  if (sets.length === 0) return null;

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

function matchPlayerIds(teams: GameForStoryResults['rounds'][0]['matches'][0]['teams']): {
  teamA: StoryResultMatchPlayer[];
  teamB: StoryResultMatchPlayer[];
} {
  const teamA = teams.find((t) => t.teamNumber === 1);
  const teamB = teams.find((t) => t.teamNumber === 2);
  return {
    teamA: (teamA?.players ?? []).map((p) => ({
      userId: p.userId,
      displayName: displayName(p.user),
      avatar: p.user.avatar,
    })),
    teamB: (teamB?.players ?? []).map((p) => ({
      userId: p.userId,
      displayName: displayName(p.user),
      avatar: p.user.avatar,
    })),
  };
}

function buildSetDetails(
  sets: GameForStoryResults['rounds'][0]['matches'][0]['sets'],
  isInTeamA: boolean
): StoryResultMatchSet[] {
  return sets
    .filter((set) => (set.teamAScore > 0 || set.teamBScore > 0) && isOfficialMatchSetRole(set.role))
    .map((set) => ({
      myScore: isInTeamA ? set.teamAScore : set.teamBScore,
      oppScore: isInTeamA ? set.teamBScore : set.teamAScore,
      isTieBreak: set.isTieBreak,
    }));
}

export function buildStoryResultMatchesForPlayer(
  game: GameForStoryResults,
  playerId: string
): StoryResultMatch[] {
  const matches: StoryResultMatch[] = [];

  for (const round of game.rounds) {
    for (const match of round.matches) {
      if (!isPrismaMatchCountedForStandingsAndRating(match, game)) continue;

      const { teamA, teamB } = matchPlayerIds(match.teams);
      const inTeamA = teamA.some((p) => p.userId === playerId);
      const inTeamB = teamB.some((p) => p.userId === playerId);
      if (!inTeamA && !inTeamB) continue;

      const sets = buildSetDetails(match.sets, inTeamA);
      if (sets.length === 0) continue;

      matches.push({
        matchId: match.id,
        roundNumber: round.roundNumber,
        matchNumber: match.matchNumber,
        result: resolveMatchResult(sets),
        teamA,
        teamB,
        sets,
      });
    }
  }

  return matches;
}

export async function loadStoryResultMatchesByGame(
  gameIds: string[]
): Promise<Map<string, GameForStoryResults>> {
  if (gameIds.length === 0) return new Map();

  const games = await prisma.game.findMany({
    where: { id: { in: gameIds } },
    select: {
      id: true,
      sport: true,
      ballsInGames: true,
      winnerOfGame: true,
      rounds: {
        orderBy: { roundNumber: 'asc' },
        select: {
          roundNumber: true,
          matches: {
            orderBy: { matchNumber: 'asc' },
            select: {
              id: true,
              matchNumber: true,
              sets: {
                orderBy: { setNumber: 'asc' },
                select: {
                  teamAScore: true,
                  teamBScore: true,
                  isTieBreak: true,
                  role: true,
                },
              },
              teams: {
                select: {
                  teamNumber: true,
                  players: {
                    select: {
                      userId: true,
                      user: { select: { firstName: true, lastName: true, avatar: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  return new Map(games.map((game) => [game.id, game]));
}
