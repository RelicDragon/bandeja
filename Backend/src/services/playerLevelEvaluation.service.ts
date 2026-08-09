import {
  EntityType,
  ParticipantStatus,
  PlayerLevelVerdict,
  ResultsStatus,
  Sport,
} from '@prisma/client';
import prisma from '../config/database';
import { ApiError } from '../utils/ApiError';

const EDIT_WINDOW_DAYS = 14;
const AGGREGATE_WINDOW_DAYS = 365;
const LEVEL_RELEVANCE_WINDOW = 0.5;
const MIN_DISTINCT_EVALUATORS = 5;
const MIN_DISTINCT_GAMES = 3;

const SUPPORTED_ENTITY_TYPES = new Set<EntityType>([
  EntityType.GAME,
  EntityType.LEAGUE,
  EntityType.TOURNAMENT,
]);

export type PlayerLevelFeedbackAggregate =
  | { available: false }
  | {
      available: true;
      totalEvaluations: number;
      totalGames: number;
      distinctEvaluators: number;
      counts: Record<PlayerLevelVerdict, number>;
      percentages: Record<PlayerLevelVerdict, number>;
    };

type AggregateRow = {
  verdict: PlayerLevelVerdict;
  evaluatorUserId: string;
  gameId: string;
};

export function roundVerdictPercentages(
  counts: Record<PlayerLevelVerdict, number>,
): Record<PlayerLevelVerdict, number> {
  const order = [
    PlayerLevelVerdict.HIGHER,
    PlayerLevelVerdict.ABOUT_RIGHT,
    PlayerLevelVerdict.LOWER,
  ];
  const total = order.reduce((sum, verdict) => sum + counts[verdict], 0);
  if (total === 0) {
    return {
      [PlayerLevelVerdict.LOWER]: 0,
      [PlayerLevelVerdict.ABOUT_RIGHT]: 0,
      [PlayerLevelVerdict.HIGHER]: 0,
    };
  }

  const exact = order.map((verdict) => ({
    verdict,
    value: (counts[verdict] / total) * 100,
  }));
  const rounded = Object.fromEntries(
    exact.map(({ verdict, value }) => [verdict, Math.floor(value)]),
  ) as Record<PlayerLevelVerdict, number>;
  const remainder = 100 - order.reduce((sum, verdict) => sum + rounded[verdict], 0);

  const byFraction = [...exact].sort((a, b) => {
    const fractionDelta = (b.value % 1) - (a.value % 1);
    return fractionDelta || order.indexOf(a.verdict) - order.indexOf(b.verdict);
  });
  for (let index = 0; index < remainder; index += 1) {
    rounded[byFraction[index % byFraction.length].verdict] += 1;
  }
  return rounded;
}

export function aggregateLevelFeedback(rows: AggregateRow[]): PlayerLevelFeedbackAggregate {
  const evaluators = new Set(rows.map((row) => row.evaluatorUserId));
  const games = new Set(rows.map((row) => row.gameId));
  if (evaluators.size < MIN_DISTINCT_EVALUATORS || games.size < MIN_DISTINCT_GAMES) {
    return { available: false };
  }

  const counts: Record<PlayerLevelVerdict, number> = {
    [PlayerLevelVerdict.LOWER]: 0,
    [PlayerLevelVerdict.ABOUT_RIGHT]: 0,
    [PlayerLevelVerdict.HIGHER]: 0,
  };
  for (const row of rows) counts[row.verdict] += 1;

  return {
    available: true,
    totalEvaluations: rows.length,
    totalGames: games.size,
    distinctEvaluators: evaluators.size,
    counts,
    percentages: roundVerdictPercentages(counts),
  };
}

function plusDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function sharedOpponentIds(
  evaluatorUserId: string,
  matches: Array<{ teams: Array<{ players: Array<{ userId: string }> }> }>,
): Set<string> {
  const ids = new Set<string>();
  for (const match of matches) {
    const matchPlayerIds = new Set(
      match.teams.flatMap((team) => team.players.map((player) => player.userId)),
    );
    if (!matchPlayerIds.has(evaluatorUserId)) continue;
    for (const userId of matchPlayerIds) {
      if (userId !== evaluatorUserId) ids.add(userId);
    }
  }
  return ids;
}

async function loadEvaluationContext(gameId: string, evaluatorUserId: string) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      sport: true,
      entityType: true,
      resultsStatus: true,
      finishedDate: true,
      endTime: true,
      participants: {
        where: { status: ParticipantStatus.PLAYING },
        select: { userId: true },
      },
      outcomes: {
        select: {
          userId: true,
          levelAfter: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
              originalAvatar: true,
            },
          },
        },
      },
      rounds: {
        select: {
          matches: {
            select: {
              teams: {
                select: { players: { select: { userId: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!game) throw new ApiError(404, 'Game not found');

  const isPlaying = game.participants.some((participant) => participant.userId === evaluatorUserId);
  if (!isPlaying) throw new ApiError(403, 'Only playing participants can give level feedback');
  if (game.resultsStatus !== ResultsStatus.FINAL) {
    throw new ApiError(409, 'Level feedback is available after results are finalized');
  }
  if (!SUPPORTED_ENTITY_TYPES.has(game.entityType)) {
    throw new ApiError(400, 'Level feedback is not available for this event type');
  }

  const latestOutcomeAt = game.outcomes.reduce<Date | null>(
    (latest, outcome) => (!latest || outcome.createdAt > latest ? outcome.createdAt : latest),
    null,
  );
  const finalizedAt = game.finishedDate ?? latestOutcomeAt ?? game.endTime;
  const editableUntil = plusDays(finalizedAt, EDIT_WINDOW_DAYS);
  const matchIds = sharedOpponentIds(
    evaluatorUserId,
    game.rounds.flatMap((round) => round.matches),
  );
  const playingIds = new Set(game.participants.map((participant) => participant.userId));
  const eligibleIds = new Set(
    [...matchIds].filter((userId) => playingIds.has(userId)),
  );
  const outcomesByUser = new Map(game.outcomes.map((outcome) => [outcome.userId, outcome]));
  eligibleIds.forEach((userId) => {
    if (!outcomesByUser.has(userId)) eligibleIds.delete(userId);
  });

  return { game, editableUntil, eligibleIds, outcomesByUser };
}

async function blockedPeerIds(evaluatorUserId: string, candidateIds: string[]): Promise<Set<string>> {
  if (candidateIds.length === 0) return new Set();
  const rows = await prisma.blockedUser.findMany({
    where: {
      OR: [
        { userId: evaluatorUserId, blockedUserId: { in: candidateIds } },
        { blockedUserId: evaluatorUserId, userId: { in: candidateIds } },
      ],
    },
    select: { userId: true, blockedUserId: true },
  });
  return new Set(
    rows.map((row) =>
      row.userId === evaluatorUserId ? row.blockedUserId : row.userId,
    ),
  );
}

export async function getGameLevelEvaluations(gameId: string, evaluatorUserId: string) {
  const context = await loadEvaluationContext(gameId, evaluatorUserId);
  const candidateIds = [...context.eligibleIds];
  const blockedIds = await blockedPeerIds(evaluatorUserId, candidateIds);
  const eligibleIds = candidateIds.filter((id) => !blockedIds.has(id));
  const existing = await prisma.playerLevelEvaluation.findMany({
    where: { gameId, evaluatorUserId, targetUserId: { in: eligibleIds } },
    select: { targetUserId: true, verdict: true, levelSnapshot: true, updatedAt: true },
  });
  const existingByTarget = new Map(existing.map((row) => [row.targetUserId, row]));

  const players = eligibleIds
    .map((targetUserId) => {
      const outcome = context.outcomesByUser.get(targetUserId);
      if (!outcome) return null;
      const saved = existingByTarget.get(targetUserId);
      return {
        user: outcome.user,
        levelSnapshot: saved?.levelSnapshot ?? outcome.levelAfter,
        verdict: saved?.verdict ?? null,
        updatedAt: saved?.updatedAt ?? null,
      };
    })
    .filter((player): player is NonNullable<typeof player> => player !== null)
    .sort((a, b) => {
      const aName = `${a.user.firstName ?? ''} ${a.user.lastName ?? ''}`.trim();
      const bName = `${b.user.firstName ?? ''} ${b.user.lastName ?? ''}`.trim();
      return aName.localeCompare(bName);
    });

  return {
    sport: context.game.sport,
    canEdit: Date.now() <= context.editableUntil.getTime(),
    editableUntil: context.editableUntil,
    completedCount: players.filter((player) => player.verdict !== null).length,
    players,
  };
}

export async function upsertGameLevelEvaluation(
  gameId: string,
  evaluatorUserId: string,
  targetUserId: string,
  verdict: PlayerLevelVerdict,
) {
  if (targetUserId === evaluatorUserId) throw new ApiError(400, 'You cannot evaluate yourself');
  const context = await loadEvaluationContext(gameId, evaluatorUserId);
  if (Date.now() > context.editableUntil.getTime()) {
    throw new ApiError(409, 'The level feedback window has closed');
  }
  if (!context.eligibleIds.has(targetUserId)) {
    throw new ApiError(403, 'You can only evaluate players you played with');
  }
  const blocked = await blockedPeerIds(evaluatorUserId, [targetUserId]);
  if (blocked.has(targetUserId)) throw new ApiError(403, 'Level feedback is unavailable for this player');
  const outcome = context.outcomesByUser.get(targetUserId);
  if (!outcome) throw new ApiError(409, 'The player has no finalized outcome');

  return prisma.playerLevelEvaluation.upsert({
    where: {
      gameId_evaluatorUserId_targetUserId: { gameId, evaluatorUserId, targetUserId },
    },
    create: {
      gameId,
      sport: context.game.sport,
      evaluatorUserId,
      targetUserId,
      verdict,
      levelSnapshot: outcome.levelAfter,
    },
    update: {
      verdict,
      sport: context.game.sport,
      levelSnapshot: outcome.levelAfter,
    },
    select: { targetUserId: true, verdict: true, levelSnapshot: true, updatedAt: true },
  });
}

export async function getPlayerLevelFeedbackAggregate(
  targetUserId: string,
  sport: Sport,
  currentLevel: number,
): Promise<PlayerLevelFeedbackAggregate> {
  const cutoff = new Date(Date.now() - AGGREGATE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await prisma.playerLevelEvaluation.findMany({
    where: {
      targetUserId,
      sport,
      createdAt: { gte: cutoff },
      levelSnapshot: {
        gte: currentLevel - LEVEL_RELEVANCE_WINDOW,
        lte: currentLevel + LEVEL_RELEVANCE_WINDOW,
      },
      game: { resultsStatus: ResultsStatus.FINAL },
    },
    select: { verdict: true, evaluatorUserId: true, gameId: true },
  });
  if (rows.length === 0) return { available: false };

  const evaluatorIds = [...new Set(rows.map((row) => row.evaluatorUserId))];
  const blocks = await prisma.blockedUser.findMany({
    where: {
      OR: [
        { userId: targetUserId, blockedUserId: { in: evaluatorIds } },
        { blockedUserId: targetUserId, userId: { in: evaluatorIds } },
      ],
    },
    select: { userId: true, blockedUserId: true },
  });
  const blockedEvaluatorIds = new Set(
    blocks.map((block) =>
      block.userId === targetUserId ? block.blockedUserId : block.userId,
    ),
  );
  return aggregateLevelFeedback(
    rows.filter((row) => !blockedEvaluatorIds.has(row.evaluatorUserId)),
  );
}
