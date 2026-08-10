import {
  EntityType,
  MatchSetRole,
  ParticipantStatus,
  PlayerLevelVerdict,
  Prisma,
  ResultsStatus,
  Sport,
} from '@prisma/client';
import prisma from '../config/database';
import { ApiError } from '../utils/ApiError';
import { isOfficialMatchSetRole } from './results/matchSetRole';

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

type SharedMatch = {
  teams: Array<{ players: Array<{ userId: string }> }>;
  sets: Array<{
    teamAScore: number;
    teamBScore: number;
    role: MatchSetRole;
  }>;
};

type AggregateGame = {
  id: string;
  participants: Array<{ userId: string }>;
  rounds: Array<{ matches: SharedMatch[] }>;
};

type EvaluationDb = Prisma.TransactionClient;

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
  matches: SharedMatch[],
): Set<string> {
  const ids = new Set<string>();
  for (const match of matches) {
    const hasPlayedOfficialSet = match.sets.some(
      (set) =>
        isOfficialMatchSetRole(set.role) &&
        (set.teamAScore > 0 || set.teamBScore > 0),
    );
    if (!hasPlayedOfficialSet) continue;
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

export function isEvaluationStillEligible(
  row: Pick<AggregateRow, 'evaluatorUserId'> & { targetUserId: string },
  game: AggregateGame | undefined,
): boolean {
  if (!game) return false;
  const playingIds = new Set(game.participants.map((participant) => participant.userId));
  if (!playingIds.has(row.evaluatorUserId) || !playingIds.has(row.targetUserId)) return false;
  return sharedOpponentIds(
    row.evaluatorUserId,
    game.rounds.flatMap((round) => round.matches),
  ).has(row.targetUserId);
}

async function loadEvaluationContext(
  db: EvaluationDb,
  gameId: string,
  evaluatorUserId: string,
) {
  const nestedGameQuery = () => db.game.findUnique({
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
              sets: {
                select: { teamAScore: true, teamBScore: true, role: true },
              },
            },
          },
        },
      },
    },
  });
  const loadTransactionGame = async () => {
    const game = await db.game.findUnique({
      where: { id: gameId },
      select: {
        id: true,
        sport: true,
        entityType: true,
        resultsStatus: true,
        finishedDate: true,
        endTime: true,
      },
    });
    if (!game) return null;

    // Keep relation reads sequential inside an interactive transaction. Prisma's
    // query strategy otherwise schedules them concurrently on one pg connection.
    const participants = await db.gameParticipant.findMany({
      where: { gameId, status: ParticipantStatus.PLAYING },
      select: { userId: true },
    });
    const outcomeRows = await db.gameOutcome.findMany({
      where: { gameId },
      select: { userId: true, levelAfter: true, createdAt: true },
    });
    const users = await db.user.findMany({
      where: { id: { in: outcomeRows.map((outcome) => outcome.userId) } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        avatar: true,
        originalAvatar: true,
      },
    });
    const usersById = new Map(users.map((user) => [user.id, user]));
    const outcomes = outcomeRows.map((outcome) => {
      const user = usersById.get(outcome.userId);
      if (!user) throw new ApiError(409, 'A finalized outcome has no player');
      return { ...outcome, user };
    });

    const matchRows = await db.match.findMany({
      where: { round: { gameId } },
      select: { id: true },
    });
    const matchIds = matchRows.map((match) => match.id);
    const teams = await db.team.findMany({
      where: { matchId: { in: matchIds } },
      select: { id: true, matchId: true },
    });
    const teamPlayers = await db.teamPlayer.findMany({
      where: { teamId: { in: teams.map((team) => team.id) } },
      select: { teamId: true, userId: true },
    });
    const sets = await db.set.findMany({
      where: { matchId: { in: matchIds } },
      select: { matchId: true, teamAScore: true, teamBScore: true, role: true },
    });
    const playersByTeam = new Map<string, Array<{ userId: string }>>();
    for (const player of teamPlayers) {
      const players = playersByTeam.get(player.teamId) ?? [];
      players.push({ userId: player.userId });
      playersByTeam.set(player.teamId, players);
    }
    const teamsByMatch = new Map<string, Array<{ players: Array<{ userId: string }> }>>();
    for (const team of teams) {
      const matchTeams = teamsByMatch.get(team.matchId) ?? [];
      matchTeams.push({ players: playersByTeam.get(team.id) ?? [] });
      teamsByMatch.set(team.matchId, matchTeams);
    }
    const setsByMatch = new Map<string, SharedMatch['sets']>();
    for (const { matchId, teamAScore, teamBScore, role } of sets) {
      const matchSets = setsByMatch.get(matchId) ?? [];
      matchSets.push({ teamAScore, teamBScore, role });
      setsByMatch.set(matchId, matchSets);
    }
    const matches = matchRows.map((match) => ({
      teams: teamsByMatch.get(match.id) ?? [],
      sets: setsByMatch.get(match.id) ?? [],
    }));

    return { ...game, participants, outcomes, rounds: [{ matches }] };
  };
  const game = db === prisma ? await nestedGameQuery() : await loadTransactionGame();
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

async function blockedPeerIds(
  db: EvaluationDb,
  evaluatorUserId: string,
  candidateIds: string[],
): Promise<Set<string>> {
  if (candidateIds.length === 0) return new Set();
  const rows = await db.blockedUser.findMany({
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
  const context = await loadEvaluationContext(prisma, gameId, evaluatorUserId);
  const candidateIds = [...context.eligibleIds];
  const blockedIds = await blockedPeerIds(prisma, evaluatorUserId, candidateIds);
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
  return prisma.$transaction(async (tx) => {
    // A shared row lock makes the eligibility check and write atomic with result reset/delete.
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "Game" WHERE "id" = ${gameId} FOR SHARE`,
    );
    const context = await loadEvaluationContext(tx, gameId, evaluatorUserId);
    if (Date.now() > context.editableUntil.getTime()) {
      throw new ApiError(409, 'The level feedback window has closed');
    }
    if (!context.eligibleIds.has(targetUserId)) {
      throw new ApiError(403, 'You can only evaluate players you played with');
    }
    const blocked = await blockedPeerIds(tx, evaluatorUserId, [targetUserId]);
    if (blocked.has(targetUserId)) {
      throw new ApiError(403, 'Level feedback is unavailable for this player');
    }
    const outcome = context.outcomesByUser.get(targetUserId);
    if (!outcome) throw new ApiError(409, 'The player has no finalized outcome');

    return tx.playerLevelEvaluation.upsert({
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

  const gameIds = [...new Set(rows.map((row) => row.gameId))];
  const games = await prisma.game.findMany({
    where: { id: { in: gameIds }, resultsStatus: ResultsStatus.FINAL },
    select: {
      id: true,
      participants: {
        where: { status: ParticipantStatus.PLAYING },
        select: { userId: true },
      },
      rounds: {
        select: {
          matches: {
            select: {
              teams: { select: { players: { select: { userId: true } } } },
              sets: { select: { teamAScore: true, teamBScore: true, role: true } },
            },
          },
        },
      },
    },
  });
  const gamesById = new Map(games.map((game) => [game.id, game]));
  const eligibleRows = rows.filter((row) =>
    isEvaluationStillEligible(
      { evaluatorUserId: row.evaluatorUserId, targetUserId },
      gamesById.get(row.gameId),
    ),
  );
  if (eligibleRows.length === 0) return { available: false };

  const evaluatorIds = [...new Set(eligibleRows.map((row) => row.evaluatorUserId))];
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
    eligibleRows.filter((row) => !blockedEvaluatorIds.has(row.evaluatorUserId)),
  );
}
