import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import {
  BracketScope,
  BracketSlotKind,
  PlayoffFormat,
  Prisma,
  ResultsStatus,
  RoundType,
} from '@prisma/client';
import { BracketAdvancementService } from './bracketAdvancement.service';
import { BracketGameNotificationService } from './bracketGameNotification.service';
import { playInPhaseComplete } from './bracketSlotEdit.util';

type BracketConfigShape = {
  groups?: Record<string, { participantIds: string[] }>;
  globalParticipantIds?: string[];
};

export class BracketSlotWalkoverService {
  static async applyWalkover(
    leagueSeasonId: string,
    slotId: string,
    userId: string,
    payload: { leagueParticipantId: string; skipGameFinal?: boolean }
  ) {
    const leagueSeason = await prisma.leagueSeason.findUnique({
      where: { id: leagueSeasonId },
      include: {
        game: {
          include: {
            participants: {
              where: { userId, role: { in: ['OWNER', 'ADMIN'] } },
            },
          },
        },
      },
    });
    if (!leagueSeason?.game) {
      throw new ApiError(404, 'League season not found');
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
    if (!user) throw new ApiError(404, 'User not found');
    if (leagueSeason.game.participants.length === 0 && !user.isAdmin) {
      throw new ApiError(403, 'Only owners and admins can assign bracket walkover');
    }

    const slot = await prisma.leagueBracketSlot.findUnique({
      where: { id: slotId },
      include: {
        game: { select: { id: true, resultsStatus: true, parentId: true } },
        feederSlotA: { select: { id: true, slotKind: true, leagueParticipantId: true, gameId: true } },
        feederSlotB: { select: { id: true, slotKind: true, leagueParticipantId: true, gameId: true } },
        leagueRound: {
          select: {
            id: true,
            leagueSeasonId: true,
            playoffFormat: true,
            bracketScope: true,
            bracketConfig: true,
          },
        },
      },
    });

    if (!slot || slot.leagueRound.leagueSeasonId !== leagueSeasonId) {
      throw new ApiError(404, 'Bracket slot not found');
    }
    if (slot.leagueRound.playoffFormat !== PlayoffFormat.BRACKET) {
      throw new ApiError(400, 'Slot is not part of a bracket playoff');
    }
    if (slot.slotKind === BracketSlotKind.BYE) {
      throw new ApiError(400, 'Cannot assign walkover on a bye slot');
    }
    if (!slot.winnerSlotId) {
      throw new ApiError(400, 'This slot has no advancement target');
    }

    const config = (slot.leagueRound.bracketConfig ?? {}) as BracketConfigShape;
    const isCross = slot.leagueRound.bracketScope === BracketScope.CROSS_GROUP;
    const pool = isCross
      ? (config.globalParticipantIds ?? [])
      : slot.leagueGroupId
        ? (config.groups?.[slot.leagueGroupId]?.participantIds ?? [])
        : [];

    if (!pool.includes(payload.leagueParticipantId)) {
      throw new ApiError(400, 'Winner is not in the bracket pool for this tree');
    }

    const createdGameIds: string[] = [];
    await prisma.$transaction(async (tx) => {
      const eligible = await this.resolveEligibleWinners(slot, pool, tx);
      if (!eligible.includes(payload.leagueParticipantId)) {
        throw new ApiError(400, 'Winner must be a contestant in this bracket match');
      }

      if (slot.gameId && slot.game?.resultsStatus === ResultsStatus.FINAL) {
        throw new ApiError(409, 'Match is already final');
      }

      if (slot.slotKind === BracketSlotKind.MAIN) {
        const treeSlots = await tx.leagueBracketSlot.findMany({
          where: { leagueRoundId: slot.leagueRoundId, leagueGroupId: slot.leagueGroupId },
          include: { game: { select: { resultsStatus: true } } },
        });
        if (!playInPhaseComplete(treeSlots)) {
          throw new ApiError(409, 'Complete all play-in games before knockout walkover');
        }
      }

      if (slot.gameId && !payload.skipGameFinal) {
        await this.finalizeWalkoverGame(slot.gameId, payload.leagueParticipantId, tx);
        const ids = await BracketAdvancementService.onGameFinalized(slot.gameId, tx);
        createdGameIds.push(...ids);
      } else {
        await tx.leagueBracketSlot.update({
          where: { id: slot.winnerSlotId! },
          data: { leagueParticipantId: payload.leagueParticipantId },
        });
        const ids = await BracketAdvancementService.tryCreateReadyGames(
          slot.leagueRoundId,
          slot.leagueGroupId ?? null,
          tx
        );
        createdGameIds.push(...ids);

        if (
          (slot.slotKind === BracketSlotKind.MAIN && !slot.winnerSlotId) ||
          slot.slotKind === BracketSlotKind.GRAND_FINAL
        ) {
          const { BracketRoundSummaryService } = await import('./bracketRoundSummary.service');
          void BracketRoundSummaryService.notifyChampionIfNeeded({
            leagueRoundId: slot.leagueRoundId,
            leagueGroupId: slot.leagueGroupId ?? null,
            leagueSeasonId,
          }).catch((err) => console.error('[BracketSummary] Failed after walkover:', err));
        }
      }
    });

    BracketGameNotificationService.notifyCreatedGames(createdGameIds);

    const round = await prisma.leagueRound.findFirst({
      where: {
        leagueSeasonId,
        roundType: RoundType.PLAYOFF,
        playoffFormat: PlayoffFormat.BRACKET,
        id: slot.leagueRoundId,
      },
      select: { id: true },
    });

    const { BracketPlayoffService } = await import('./bracketPlayoff.service');
    return BracketPlayoffService.getBracketPlayoff(leagueSeasonId, userId, {
      roundId: round?.id,
      leagueGroupId: isCross ? undefined : (slot.leagueGroupId ?? undefined),
    });
  }

  private static async resolveEligibleWinners(
    slot: {
      id: string;
      slotKind: BracketSlotKind;
      gameId: string | null;
      leagueGroupId: string | null;
      leagueRoundId: string;
      feederSlotA: {
        slotKind: BracketSlotKind;
        leagueParticipantId: string | null;
        gameId: string | null;
      } | null;
      feederSlotB: {
        slotKind: BracketSlotKind;
        leagueParticipantId: string | null;
        gameId: string | null;
      } | null;
    },
    pool: string[],
    tx: Prisma.TransactionClient
  ): Promise<string[]> {
    if (slot.gameId) {
      const ids = await this.participantsFromGame(slot.gameId, tx);
      return ids.filter((id) => pool.includes(id));
    }

    const fromFeeders: string[] = [];
    for (const feeder of [slot.feederSlotA, slot.feederSlotB]) {
      if (!feeder) continue;
      if (feeder.slotKind === BracketSlotKind.BYE && feeder.leagueParticipantId) {
        fromFeeders.push(feeder.leagueParticipantId);
      } else if (feeder.gameId) {
        const winner = await BracketAdvancementService.resolveWinnerParticipantIdFromGame(
          feeder.gameId
        );
        if (winner) fromFeeders.push(winner);
      } else if (feeder.leagueParticipantId) {
        fromFeeders.push(feeder.leagueParticipantId);
      }
    }
    const unique = [...new Set(fromFeeders)].filter((id) => pool.includes(id));
    if (unique.length < 2) {
      throw new ApiError(400, 'Cannot determine both contestants for walkover on this slot');
    }
    return unique;
  }

  private static async participantsFromGame(
    gameId: string,
    tx: Prisma.TransactionClient
  ): Promise<string[]> {
    const game = await tx.game.findUnique({
      where: { id: gameId },
      include: {
        fixedTeams: { include: { players: true } },
      },
    });
    if (!game?.parentId || !game.fixedTeams?.length) return [];

    const { findTeamParticipantByRoster } = await import('./leagueParticipantResolve');
    const out: string[] = [];
    for (const team of game.fixedTeams) {
      const playerIds = team.players
        .map((p) => p.userId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);
      const participant = await findTeamParticipantByRoster(tx, game.parentId, playerIds);
      if (participant?.id) out.push(participant.id);
    }
    return out;
  }

  private static async finalizeWalkoverGame(
    gameId: string,
    winnerParticipantId: string,
    tx: Prisma.TransactionClient
  ): Promise<void> {
    const game = await tx.game.findUnique({
      where: { id: gameId },
      include: {
        fixedTeams: { include: { players: true }, orderBy: { teamNumber: 'asc' } },
        outcomes: true,
      },
    });
    if (!game?.parentId) {
      throw new ApiError(400, 'Bracket game not found');
    }

    const teamParticipants: { teamNumber: number; participantId: string; playerIds: string[] }[] =
      [];
    const { findTeamParticipantByRoster } = await import('./leagueParticipantResolve');
    for (const team of game.fixedTeams) {
      const playerIds = team.players
        .map((p) => p.userId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);
      const participant = await findTeamParticipantByRoster(tx, game.parentId, playerIds);
      if (!participant?.id) {
        throw new ApiError(400, 'Cannot finalize walkover: match teams are incomplete');
      }
      teamParticipants.push({
        teamNumber: team.teamNumber,
        participantId: participant.id,
        playerIds,
      });
    }

    if (teamParticipants.length < 2) {
      throw new ApiError(400, 'Walkover requires two sides on the match');
    }
    if (!teamParticipants.some((t) => t.participantId === winnerParticipantId)) {
      throw new ApiError(400, 'Winner must be a contestant in this match');
    }

    let position = 1;
    for (const team of teamParticipants) {
      const isWinner = team.participantId === winnerParticipantId;
      for (const userId of team.playerIds) {
        await tx.gameOutcome.upsert({
          where: { gameId_userId: { gameId, userId } },
          create: {
            gameId,
            userId,
            position,
            wins: isWinner ? 1 : 0,
            losses: isWinner ? 0 : 1,
            ties: 0,
            isWinner,
            pointsEarned: 0,
            levelBefore: 0,
            levelAfter: 0,
            levelChange: 0,
            reliabilityBefore: 0,
            reliabilityAfter: 0,
            reliabilityChange: 0,
          },
          update: {
            wins: isWinner ? 1 : 0,
            losses: isWinner ? 0 : 1,
            isWinner,
          },
        });
        position++;
      }
    }

    await tx.game.update({
      where: { id: gameId },
      data: { resultsStatus: ResultsStatus.FINAL, status: 'FINISHED' },
    });
  }
}
