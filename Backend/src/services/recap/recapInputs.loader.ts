import { EntityType, MatchSetRole, Prisma, Sport } from '@prisma/client';
import prisma from '../../config/database';
import { isRelationshipInsightMatch } from '../user/userPerformanceInsights.service';
import type { RecapBuildInput, RecapGameInput, RecapPartnerAppearance } from './recapPayload.builder';
import { monthKeyRange, recapLowActivityLookbackStart } from './recapMonth';
import type { RecapUserPage } from './monthlyRecapPass';

/**
 * PRD 353 — everything the payload builder needs, read from Postgres.
 *
 * The scheduler walks thousands of users, so this module never loads "all
 * users" or a user's whole history: eligibility is a cursor-batched `groupBy`
 * over one month's outcomes, and the per-user read is bounded by that month.
 */

/** Event-style games are results-only noise in a personal recap. */
const RECAP_EXCLUDED_ENTITY_TYPES: EntityType[] = [EntityType.EVENT, EntityType.BAR];

const RECAP_OUTCOME_WHERE = (start: Date, end: Date): Prisma.GameOutcomeWhereInput => ({
  game: {
    resultsStatus: 'FINAL',
    finishedDate: { gte: start, lt: end },
    entityType: { notIn: RECAP_EXCLUDED_ENTITY_TYPES },
  },
});

/**
 * User ids with at least one FINAL game in the month, in ascending id order so
 * the scheduler can resume from a cursor instead of holding the world in RAM.
 */
export async function findUserIdsWithGamesInMonth(
  monthKey: string,
  options: { cursor?: string; limit: number },
): Promise<RecapUserPage> {
  const { start, end } = monthKeyRange(monthKey);
  const rows = await prisma.gameOutcome.groupBy({
    by: ['userId'],
    where: {
      ...RECAP_OUTCOME_WHERE(start, end),
      ...(options.cursor ? { userId: { gt: options.cursor } } : {}),
    },
    orderBy: { userId: 'asc' },
    take: options.limit,
  });
  const userIds = rows.map((row) => row.userId);
  return {
    userIds,
    // Nothing is filtered out here, so a short page really is the last one.
    nextCursor: rows.length < options.limit ? null : userIds[userIds.length - 1] ?? null,
  };
}

/**
 * Users who played nothing last month but were active in the lookback window —
 * they get the three-slide "come back" reel (PRD 353 story 5).
 */
export async function findLowActivityUserIdsForMonth(
  monthKey: string,
  options: { cursor?: string; limit: number },
): Promise<RecapUserPage> {
  const { start, end } = monthKeyRange(monthKey);
  const lookbackStart = recapLowActivityLookbackStart(start);
  const rows = await prisma.gameOutcome.groupBy({
    by: ['userId'],
    where: {
      game: {
        resultsStatus: 'FINAL',
        finishedDate: { gte: lookbackStart, lt: start },
        entityType: { notIn: RECAP_EXCLUDED_ENTITY_TYPES },
      },
      ...(options.cursor ? { userId: { gt: options.cursor } } : {}),
    },
    orderBy: { userId: 'asc' },
    take: options.limit,
  });
  if (rows.length === 0) return { userIds: [], nextCursor: null };

  const scanned = rows.map((row) => row.userId);
  /*
   * The cursor is the last id **scanned**, and exhaustion is decided by the
   * scan, not by what survives the filter below. Taking either from the
   * filtered list made the sweep stop at the first page that happened to
   * contain someone who also played last month — which is most of them.
   */
  const nextCursor = rows.length < options.limit ? null : scanned[scanned.length - 1] ?? null;

  // Anyone who *did* play last month is handled by the full-recap sweep.
  const played = await prisma.gameOutcome.groupBy({
    by: ['userId'],
    where: {
      ...RECAP_OUTCOME_WHERE(start, end),
      userId: { in: scanned },
    },
  });
  const playedIds = new Set(played.map((row) => row.userId));
  return { userIds: scanned.filter((id) => !playedIds.has(id)), nextCursor };
}

const RECAP_PARTNER_USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  avatar: true,
} as const;

/** Teammates of `userId` in every decided match of the game, one entry per match. */
function partnerAppearances(
  userId: string,
  rounds: Array<{
    matches: Array<{
      winnerId: string | null;
      sets: Array<{ teamAScore: number; teamBScore: number; role: MatchSetRole }>;
      teams: Array<{
        id: string;
        players: Array<{
          userId: string;
          user: { firstName: string | null; lastName: string | null; avatar: string | null };
        }>;
      }>;
    }>;
  }>,
): RecapPartnerAppearance[] {
  const appearances: RecapPartnerAppearance[] = [];
  for (const round of rounds) {
    for (const match of round.matches) {
      if (!isRelationshipInsightMatch(match)) continue;
      const myTeam = match.teams.find((team) =>
        team.players.some((player) => player.userId === userId),
      );
      if (!myTeam) continue;
      const won = match.winnerId != null && match.winnerId === myTeam.id;
      for (const player of myTeam.players) {
        if (player.userId === userId) continue;
        appearances.push({
          userId: player.userId,
          firstName: player.user.firstName,
          lastName: player.user.lastName,
          avatar: player.user.avatar,
          won,
        });
      }
    }
  }
  return appearances;
}

export type RecapOwnerRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  isPremium: boolean;
  language: string | null;
  primarySport: Sport | null;
  playStreakCount: number;
  playStreakBest: number;
};

export async function loadRecapOwner(userId: string): Promise<RecapOwnerRow | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatar: true,
      isPremium: true,
      language: true,
      primarySport: true,
      playStreakCount: true,
      playStreakBest: true,
    },
  });
}

/** Everything the pure builder needs for one user and one month. */
export async function loadRecapBuildInput(
  owner: RecapOwnerRow,
  monthKey: string,
): Promise<RecapBuildInput> {
  const { start, end } = monthKeyRange(monthKey);

  const [outcomes, levelEvents] = await Promise.all([
    prisma.gameOutcome.findMany({
      where: { userId: owner.id, ...RECAP_OUTCOME_WHERE(start, end) },
      select: {
        gameId: true,
        isWinner: true,
        isWinForStreak: true,
        wins: true,
        ties: true,
        losses: true,
        scoresMade: true,
        scoresLost: true,
        position: true,
        levelBefore: true,
        levelAfter: true,
        createdAt: true,
        game: {
          select: {
            sport: true,
            winnerOfGame: true,
            finishedDate: true,
            club: { select: { id: true, name: true, avatar: true } },
            court: { select: { club: { select: { id: true, name: true, avatar: true } } } },
            rounds: {
              select: {
                matches: {
                  select: {
                    winnerId: true,
                    sets: { select: { teamAScore: true, teamBScore: true, role: true } },
                    teams: {
                      select: {
                        id: true,
                        players: {
                          select: {
                            userId: true,
                            user: { select: RECAP_PARTNER_USER_SELECT },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.levelChangeEvent.findMany({
      where: { userId: owner.id, createdAt: { gte: start, lt: end } },
      select: { sport: true, levelBefore: true, levelAfter: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const games: RecapGameInput[] = outcomes.flatMap((outcome) => {
    const finishedAt = outcome.game.finishedDate;
    if (!finishedAt) return [];
    const club = outcome.game.club ?? outcome.game.court?.club ?? null;
    return [
      {
        gameId: outcome.gameId,
        sport: outcome.game.sport,
        finishedAt,
        club: club ? { id: club.id, name: club.name, avatar: club.avatar } : null,
        outcome: {
          isWinner: outcome.isWinner,
          isWinForStreak: outcome.isWinForStreak,
          wins: outcome.wins,
          ties: outcome.ties,
          losses: outcome.losses,
          scoresMade: outcome.scoresMade,
          scoresLost: outcome.scoresLost,
          position: outcome.position,
          winnerOfGame: outcome.game.winnerOfGame,
          createdAt: outcome.createdAt,
        },
        levelBefore: outcome.levelBefore,
        levelAfter: outcome.levelAfter,
        partners: partnerAppearances(owner.id, outcome.game.rounds),
      },
    ];
  });

  return {
    monthKey,
    owner: {
      firstName: owner.firstName,
      lastName: owner.lastName,
      avatar: owner.avatar,
      isPremium: owner.isPremium,
    },
    games,
    levelEvents,
    streak:
      owner.playStreakCount > 0
        ? { weeks: owner.playStreakCount, best: owner.playStreakBest }
        : null,
  };
}
