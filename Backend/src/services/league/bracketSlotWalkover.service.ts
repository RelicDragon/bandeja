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
        feederSlotA: {
          select: {
            id: true,
            slotKind: true,
            leagueParticipantId: true,
            gameId: true,
            game: { select: { resultsStatus: true } },
          },
        },
        feederSlotB: {
          select: {
            id: true,
            slotKind: true,
            leagueParticipantId: true,
            gameId: true,
            game: { select: { resultsStatus: true } },
          },
        },
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
    const isTerminalChampionship =
      slot.slotKind === BracketSlotKind.GRAND_FINAL ||
      slot.slotKind === BracketSlotKind.THIRD_PLACE ||
      (slot.slotKind === BracketSlotKind.MAIN && !slot.winnerSlotId);
    if (!slot.winnerSlotId && !slot.gameId && !isTerminalChampionship) {
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
      await BracketAdvancementService.lockBracketRound(slot.leagueRoundId, tx);
      await tx.$queryRaw`
        SELECT "id"
        FROM "LeagueBracketSlot"
        WHERE "id" = ${slot.id}
        FOR UPDATE
      `;
      const lockedSlot = await tx.leagueBracketSlot.findUnique({
        where: { id: slot.id },
        include: {
          game: { select: { id: true, resultsStatus: true, parentId: true } },
          feederSlotA: {
            select: {
              id: true,
              slotKind: true,
              leagueParticipantId: true,
              gameId: true,
              game: { select: { resultsStatus: true } },
            },
          },
          feederSlotB: {
            select: {
              id: true,
              slotKind: true,
              leagueParticipantId: true,
              gameId: true,
              game: { select: { resultsStatus: true } },
            },
          },
        },
      });
      if (!lockedSlot) {
        throw new ApiError(404, 'Bracket slot not found');
      }
      if (lockedSlot.gameId) {
        await tx.$queryRaw`
          SELECT "id"
          FROM "Game"
          WHERE "id" = ${lockedSlot.gameId}
          FOR UPDATE
        `;
        const lockedGame = await tx.game.findUnique({
          where: { id: lockedSlot.gameId },
          select: { resultsStatus: true },
        });
        if (lockedGame?.resultsStatus === ResultsStatus.FINAL) {
          throw new ApiError(409, 'Match is already final');
        }
      }
      const eligible = await this.resolveEligibleWinners(lockedSlot, pool, tx);
      if (!eligible.includes(payload.leagueParticipantId)) {
        throw new ApiError(400, 'Winner must be a contestant in this bracket match');
      }

      if (lockedSlot.slotKind === BracketSlotKind.MAIN) {
        const treeSlots = await tx.leagueBracketSlot.findMany({
          where: {
            leagueRoundId: lockedSlot.leagueRoundId,
            leagueGroupId: lockedSlot.leagueGroupId,
          },
          include: { game: { select: { resultsStatus: true } } },
        });
        if (!playInPhaseComplete(treeSlots)) {
          throw new ApiError(409, 'Complete all play-in games before knockout walkover');
        }
      }

      let gameId = lockedSlot.gameId;
      if (!gameId) {
        const ids = await BracketAdvancementService.tryCreateReadyGames(
          lockedSlot.leagueRoundId,
          lockedSlot.leagueGroupId ?? null,
          tx
        );
        createdGameIds.push(...ids);
        const materialized = await tx.leagueBracketSlot.findUnique({
          where: { id: lockedSlot.id },
          select: { gameId: true },
        });
        gameId = materialized?.gameId ?? null;
      }
      if (!gameId) {
        throw new ApiError(400, 'Championship contestants must be resolved before a walkover');
      }

      // `skipGameFinal` remains accepted for older clients, but advancement is
      // always backed by an auditable FINAL game. A cached participant on a
      // non-BYE slot is deliberately never treated as proof of a winner.
      await this.finalizeWalkoverGame(gameId, payload.leagueParticipantId, tx);
      const ids = await BracketAdvancementService.onGameFinalized(gameId, tx);
      createdGameIds.push(...ids);
      const { syncParentSeasonPodiumIfFinal } = await import(
        '../achievements/podiumGrant.service'
      );
      await syncParentSeasonPodiumIfFinal({ gameId, tx });
    });

    BracketGameNotificationService.notifyCreatedGames(createdGameIds);
    const { BracketRoundSummaryService } = await import('./bracketRoundSummary.service');
    await BracketRoundSummaryService.notifyChampionIfNeeded({
      leagueRoundId: slot.leagueRoundId,
      leagueGroupId: slot.leagueGroupId ?? null,
      leagueSeasonId,
    }).catch((err) => console.error('[BracketSummary] Failed after committed walkover:', err));

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
        id: string;
        slotKind: BracketSlotKind;
        leagueParticipantId: string | null;
        gameId: string | null;
        game: { resultsStatus: ResultsStatus } | null;
      } | null;
      feederSlotB: {
        id: string;
        slotKind: BracketSlotKind;
        leagueParticipantId: string | null;
        gameId: string | null;
        game: { resultsStatus: ResultsStatus } | null;
      } | null;
      roundIndex: number;
    },
    pool: string[],
    tx: Prisma.TransactionClient
  ): Promise<string[]> {
    if (slot.gameId) {
      const ids = await this.participantsFromGame(slot.gameId, tx);
      return ids.filter((id) => pool.includes(id));
    }

    const fromFeeders: string[] = [];
    for (const [index, feeder] of [slot.feederSlotA, slot.feederSlotB].entries()) {
      if (!feeder) continue;
      const participant =
        slot.slotKind === BracketSlotKind.GRAND_FINAL &&
        slot.roundIndex > 0 &&
        index === 0 &&
        feeder.gameId
          ? await BracketAdvancementService.resolveLoserParticipantId(feeder.gameId, tx)
          : await BracketAdvancementService.participantIdFromFeeder(
              feeder,
              tx,
              slot.slotKind
            );
      if (participant) fromFeeders.push(participant);
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
        participants: {
          where: { status: 'PLAYING' },
          select: { userId: true },
        },
      },
    });
    if (!game?.parentId) {
      throw new ApiError(400, 'Bracket game not found');
    }

    const playingUserIds = new Set(game.participants.map((p) => p.userId));

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
        // T2: only players who are PLAYING get outcomes (no bench sticker trophies).
        playerIds: playerIds.filter((id) => playingUserIds.has(id)),
      });
    }

    if (teamParticipants.length < 2) {
      throw new ApiError(400, 'Walkover requires two sides on the match');
    }
    if (!teamParticipants.some((t) => t.participantId === winnerParticipantId)) {
      throw new ApiError(400, 'Winner must be a contestant in this match');
    }
    if (teamParticipants.some((t) => t.playerIds.length === 0)) {
      throw new ApiError(400, 'Walkover requires PLAYING players on each side');
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
            position,
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
