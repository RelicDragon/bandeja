import { Prisma, ResultsStatus } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { findTeamParticipantByRoster } from './leagueParticipantResolve';

/**
 * Neutral technical fixture result: W/L only, no set/game Δ, no rating.
 * Clears partial match scores so H2H/mini-table stay neutral.
 */
export async function finalizeNeutralTechnicalFixture(
  gameId: string,
  winnerParticipantId: string,
  tx: Prisma.TransactionClient
): Promise<void> {
  const game = await tx.game.findUnique({
    where: { id: gameId },
    include: {
      fixedTeams: { include: { players: true }, orderBy: { teamNumber: 'asc' } },
      outcomes: true,
      participants: {
        where: { status: 'PLAYING' },
        select: { userId: true },
      },
      rounds: {
        select: {
          id: true,
          matches: { select: { id: true } },
        },
      },
    },
  });
  if (!game?.parentId) {
    throw new ApiError(400, 'League fixture not found');
  }

  const playingUserIds = new Set(game.participants.map((p) => p.userId));

  const teamParticipants: { teamNumber: number; participantId: string; playerIds: string[] }[] =
    [];
  for (const team of game.fixedTeams) {
    const rosterIds = team.players
      .map((p) => p.userId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    const participant = await findTeamParticipantByRoster(tx, game.parentId, rosterIds);
    if (!participant?.id) {
      throw new ApiError(400, 'Cannot finalize technical result: match teams are incomplete');
    }
    const playingOnSide = rosterIds.filter((id) => playingUserIds.has(id));
    // Prefer PLAYING; if none marked PLAYING, still settle from GameTeam roster.
    const playerIds = playingOnSide.length > 0 ? playingOnSide : rosterIds;
    if (playerIds.length === 0) {
      throw new ApiError(400, 'Technical result requires players on each side');
    }
    for (const userId of playerIds) {
      if (!playingUserIds.has(userId)) {
        const existing = await tx.gameParticipant.findFirst({
          where: { gameId, userId },
        });
        if (!existing) {
          await tx.gameParticipant.create({
            data: {
              gameId,
              userId,
              role: 'PARTICIPANT',
              status: 'PLAYING',
            },
          });
        } else if (existing.status !== 'PLAYING') {
          await tx.gameParticipant.update({
            where: { id: existing.id },
            data: { status: 'PLAYING' },
          });
        }
      }
    }
    teamParticipants.push({
      teamNumber: team.teamNumber,
      participantId: participant.id,
      playerIds,
    });
  }

  if (teamParticipants.length < 2) {
    throw new ApiError(400, 'Technical result requires two sides on the match');
  }
  if (!teamParticipants.some((t) => t.participantId === winnerParticipantId)) {
    throw new ApiError(400, 'Winner must be a contestant in this match');
  }

  const matchIds = game.rounds.flatMap((r) => r.matches.map((m) => m.id));
  if (matchIds.length > 0) {
    await tx.set.deleteMany({ where: { matchId: { in: matchIds } } });
    await tx.match.updateMany({
      where: { id: { in: matchIds } },
      data: {
        winnerId: null,
        metadata: { nonRallyOutcome: 'WALKOVER', technicalWithdrawal: true } as Prisma.InputJsonValue,
      },
    });
  }

  await tx.gameOutcome.deleteMany({ where: { gameId } });

  let position = 1;
  for (const team of teamParticipants) {
    const isWinner = team.participantId === winnerParticipantId;
    for (const userId of team.playerIds) {
      await tx.gameOutcome.create({
        data: {
          gameId,
          userId,
          position,
          wins: isWinner ? 1 : 0,
          losses: isWinner ? 0 : 1,
          ties: 0,
          isWinner,
          isWinForStreak: isWinner,
          scoresMade: 0,
          scoresLost: 0,
          pointsEarned: 0,
          levelBefore: 0,
          levelAfter: 0,
          levelChange: 0,
          reliabilityBefore: 0,
          reliabilityAfter: 0,
          reliabilityChange: 0,
          metadata: {
            nonRallyOutcome: 'WALKOVER',
            technicalWithdrawal: true,
            ratingStatsApplied: false,
          },
        },
      });
      position++;
    }
  }

  const prevMeta =
    game.metadata && typeof game.metadata === 'object' && !Array.isArray(game.metadata)
      ? (game.metadata as Record<string, unknown>)
      : {};

  await tx.game.update({
    where: { id: gameId },
    data: {
      resultsStatus: ResultsStatus.FINAL,
      status: 'FINISHED',
      metadata: {
        ...prevMeta,
        technicalWithdrawal: true,
        nonRallyOutcome: 'WALKOVER',
      } as Prisma.InputJsonValue,
    },
  });
}
