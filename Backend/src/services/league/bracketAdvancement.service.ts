import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import {
  BracketSlotKind,
  PlayoffFormat,
  Prisma,
  ResultsStatus,
} from '@prisma/client';
import { createLeagueGame, PlayoffGameSetupOverrides } from './gameCreation.util';
import { PlannedBracketSlot } from './bracketStructure';
import {
  BracketSlotRow,
  collectDescendantSlotIds,
  hasBlockingDownstreamMainFinal,
  playInPhaseComplete,
  slotsById,
} from './bracketSlotEdit.util';
import {
  championshipResolvedByFirstGrandFinal,
  grandFinalResetRequired,
} from './bracketDoubleElimination.util';
import { stalePlayingParticipantIds } from './bracketSlotPatch.util';
import {
  BracketGameSetupConfig,
  resolveBracketSlotGameSetup,
} from './bracketSlotGameSetup';

const PLAY_IN_GATE_MESSAGE =
  'Complete all play-in games before scheduling or finishing knockout matches';

type BracketRoundConfigShape = BracketGameSetupConfig;

export function resolveBracketFixtureAffectsRating(
  seasonGame: { affectsRating?: boolean | null },
): boolean {
  return seasonGame.affectsRating ?? true;
}

export class BracketAdvancementService {
  /**
   * Serializes every mutation that can resolve or invalidate games in one
   * bracket round. Results for different semifinals are saved in separate
   * transactions, so without this shared lock both transactions could observe
   * the other semifinal as unfinished and neither would create the final.
   */
  static async lockBracketRound(
    leagueRoundId: string,
    tx: Prisma.TransactionClient
  ): Promise<void> {
    await tx.$queryRaw`
      SELECT "id"
      FROM "LeagueRound"
      WHERE "id" = ${leagueRoundId}
      FOR UPDATE
    `;
  }

  /** Acquires the bracket-round lock before a result transaction mutates a game. */
  static async lockRoundForBracketGame(
    gameId: string,
    tx: Prisma.TransactionClient
  ): Promise<void> {
    const slot = await tx.leagueBracketSlot.findFirst({
      where: { gameId },
      select: {
        leagueRoundId: true,
        leagueRound: { select: { playoffFormat: true } },
      },
    });
    if (slot?.leagueRound.playoffFormat === PlayoffFormat.BRACKET) {
      await this.lockBracketRound(slot.leagueRoundId, tx);
    }
  }

  static async assertPlayInCompleteForMainBracketGame(
    gameId: string,
    tx: Prisma.TransactionClient
  ): Promise<void> {
    const slot = await tx.leagueBracketSlot.findFirst({
      where: { gameId },
      select: {
        slotKind: true,
        leagueRoundId: true,
        leagueGroupId: true,
        leagueRound: { select: { playoffFormat: true } },
      },
    });
    if (!slot || slot.leagueRound.playoffFormat !== PlayoffFormat.BRACKET) return;
    if (slot.slotKind !== BracketSlotKind.MAIN) return;

    const treeSlots = await tx.leagueBracketSlot.findMany({
      where: { leagueRoundId: slot.leagueRoundId, leagueGroupId: slot.leagueGroupId },
      include: { game: { select: { resultsStatus: true } } },
    });
    const rows: BracketSlotRow[] = treeSlots.map((s) => ({
      id: s.id,
      slotKind: s.slotKind,
      phaseIndex: 0,
      roundIndex: s.roundIndex,
      leagueParticipantId: s.leagueParticipantId,
      gameId: s.gameId,
      winnerSlotId: s.winnerSlotId,
      feederSlotAId: s.feederSlotAId,
      feederSlotBId: s.feederSlotBId,
      game: s.game,
    }));
    if (!playInPhaseComplete(rows)) {
      throw new ApiError(409, PLAY_IN_GATE_MESSAGE);
    }
  }

  static async onGameFinalized(gameId: string, tx: Prisma.TransactionClient): Promise<string[]> {
    const slot = await tx.leagueBracketSlot.findFirst({
      where: { gameId },
      include: {
        leagueRound: { select: { playoffFormat: true, leagueSeasonId: true } },
      },
    });

    if (!slot || slot.leagueRound.playoffFormat !== PlayoffFormat.BRACKET) {
      return [];
    }

    const winnerId = await this.resolveWinnerParticipantId(gameId, tx);
    if (winnerId && slot.winnerSlotId) {
      await tx.leagueBracketSlot.update({
        where: { id: slot.winnerSlotId },
        data: { leagueParticipantId: winnerId },
      });
    }

    const createdGameIds = await this.tryCreateReadyGames(
      slot.leagueRoundId,
      slot.leagueGroupId ?? null,
      tx
    );

    return createdGameIds;
  }

  static async tryCreateReadyGames(
    leagueRoundId: string,
    leagueGroupId: string | null,
    tx: Prisma.TransactionClient
  ): Promise<string[]> {
    await this.lockBracketRound(leagueRoundId, tx);
    const round = await tx.leagueRound.findUnique({
      where: { id: leagueRoundId },
      include: {
        leagueSeason: {
          include: {
            game: {
              include: {
                fixedTeams: {
                  include: { players: true },
                  orderBy: { teamNumber: 'asc' },
                },
              },
            },
          },
        },
      },
    });
    if (!round?.leagueSeason?.game) return [];

    const seasonGame = round.leagueSeason.game;
    const bracketConfig = round.bracketConfig as BracketRoundConfigShape | null;
    const createdGameIds: string[] = [];
    const slots = await tx.leagueBracketSlot.findMany({
      where: { leagueRoundId, leagueGroupId, gameId: null, slotKind: { not: BracketSlotKind.BYE } },
      include: {
        feederSlotA: { include: { game: true } },
        feederSlotB: { include: { game: true } },
      },
    });

    for (const slot of slots) {
      const resetParticipants =
        slot.slotKind === BracketSlotKind.GRAND_FINAL && slot.roundIndex > 0
          ? await this.grandFinalResetParticipants(slot.feederSlotAId, tx)
          : null;
      const teamA =
        resetParticipants?.teamA ??
        (await this.participantIdFromFeeder(slot.feederSlotA, tx, slot.slotKind));
      const teamB =
        resetParticipants?.teamB ??
        (await this.participantIdFromFeeder(slot.feederSlotB, tx, slot.slotKind));
      if (slot.slotKind === BracketSlotKind.GRAND_FINAL && slot.roundIndex > 0 && !resetParticipants) {
        continue;
      }
      if (!teamA || !teamB) continue;

      const gameId = await this.attachGameToSlot(tx, {
        slotId: slot.id,
        leagueRoundId,
        leagueSeasonId: round.leagueSeasonId,
        leagueGroupId,
        participantA: teamA,
        participantB: teamB,
        seasonGame,
        gameSetup: resolveBracketSlotGameSetup(
          bracketConfig,
          leagueGroupId,
          slot.slotKey,
        ),
      });
      if (gameId) createdGameIds.push(gameId);
    }
    return createdGameIds;
  }

  private static async grandFinalResetParticipants(
    firstGrandFinalSlotId: string | null,
    tx: Prisma.TransactionClient
  ): Promise<{ teamA: string; teamB: string } | null> {
    if (!firstGrandFinalSlotId) return null;
    const firstFinal = await tx.leagueBracketSlot.findUnique({
      where: { id: firstGrandFinalSlotId },
      include: {
        game: { select: { id: true, resultsStatus: true } },
        feederSlotA: { include: { game: true } },
        feederSlotB: { include: { game: true } },
      },
    });
    if (
      !firstFinal?.gameId ||
      firstFinal.game?.resultsStatus !== ResultsStatus.FINAL ||
      firstFinal.slotKind !== BracketSlotKind.GRAND_FINAL
    ) {
      return null;
    }

    const [firstFinalWinner, winnersChampion, losersChampion] = await Promise.all([
      this.resolveWinnerParticipantId(firstFinal.gameId, tx),
      this.participantIdFromFeeder(firstFinal.feederSlotA, tx, BracketSlotKind.GRAND_FINAL),
      this.participantIdFromFeeder(firstFinal.feederSlotB, tx, BracketSlotKind.GRAND_FINAL),
    ]);
    if (
      !grandFinalResetRequired({
        firstFinalWinnerId: firstFinalWinner,
        winnersChampionId: winnersChampion,
        losersChampionId: losersChampion,
      }) ||
      !winnersChampion ||
      !losersChampion
    ) {
      return null;
    }
    return { teamA: winnersChampion, teamB: losersChampion };
  }

  static async createGameForSlot(
    tx: Prisma.TransactionClient,
    params: {
      slotId: string;
      planned: PlannedBracketSlot;
      orderedParticipantIds: string[];
      leagueSeasonId: string;
      leagueGroupId: string | null;
      roundId: string;
      seasonGame: Parameters<typeof createLeagueGame>[0]['seasonGame'];
      gameSetup?: PlayoffGameSetupOverrides;
    }
  ): Promise<string | null> {
    const { slotId, planned, orderedParticipantIds, leagueSeasonId, leagueGroupId, roundId, seasonGame, gameSetup } =
      params;

    let participantA: string;
    let participantB: string;

    if (
      (planned.slotKind === BracketSlotKind.PLAY_IN ||
        (planned.slotKind === BracketSlotKind.MAIN && planned.seedRankA && planned.seedRankB)) &&
      planned.seedRankA &&
      planned.seedRankB
    ) {
      participantA = orderedParticipantIds[planned.seedRankA - 1];
      participantB = orderedParticipantIds[planned.seedRankB - 1];
    } else if (
      planned.slotKind === BracketSlotKind.MAIN ||
      planned.slotKind === BracketSlotKind.THIRD_PLACE ||
      planned.slotKind === BracketSlotKind.CONSOLATION ||
      planned.slotKind === BracketSlotKind.LOSERS ||
      planned.slotKind === BracketSlotKind.GRAND_FINAL
    ) {
      const slot = await tx.leagueBracketSlot.findUnique({
        where: { id: slotId },
        include: {
          feederSlotA: { include: { game: true } },
          feederSlotB: { include: { game: true } },
        },
      });
      if (!slot) throw new ApiError(404, 'Bracket slot not found');
      const teamA = await this.participantIdFromFeeder(slot.feederSlotA, tx, planned.slotKind);
      const teamB = await this.participantIdFromFeeder(slot.feederSlotB, tx, planned.slotKind);
      if (!teamA || !teamB) return null;
      participantA = teamA;
      participantB = teamB;
    } else {
      return null;
    }

    return this.attachGameToSlot(tx, {
      slotId,
      leagueRoundId: roundId,
      leagueSeasonId,
      leagueGroupId,
      participantA,
      participantB,
      seasonGame,
      gameSetup,
    });
  }

  private static async attachGameToSlot(
    tx: Prisma.TransactionClient,
    params: {
      slotId: string;
      leagueRoundId: string;
      leagueSeasonId: string;
      leagueGroupId: string | null;
      participantA: string;
      participantB: string;
      seasonGame: Parameters<typeof createLeagueGame>[0]['seasonGame'];
      gameSetup?: PlayoffGameSetupOverrides;
    }
  ): Promise<string | null> {
    const { slotId, leagueRoundId, leagueSeasonId, leagueGroupId, participantA, participantB, seasonGame, gameSetup } =
      params;
    await tx.$queryRaw`
      SELECT "id"
      FROM "LeagueBracketSlot"
      WHERE "id" = ${slotId}
      FOR UPDATE
    `;
    const existingSlot = await tx.leagueBracketSlot.findUnique({
      where: { id: slotId },
      select: {
        gameId: true,
        scheduledClubId: true,
        scheduledCourtId: true,
        scheduledStartTime: true,
        scheduledEndTime: true,
        scheduledClub: { select: { cityId: true } },
      },
    });
    if (!existingSlot || existingSlot.gameId) return null;

    const [team1, team2] = await Promise.all([
      this.rosterForParticipant(participantA, tx),
      this.rosterForParticipant(participantB, tx),
    ]);

    const scheduleTemplate =
      existingSlot.scheduledClubId &&
      existingSlot.scheduledCourtId &&
      existingSlot.scheduledStartTime &&
      existingSlot.scheduledEndTime &&
      existingSlot.scheduledClub
        ? {
            clubId: existingSlot.scheduledClubId,
            courtId: existingSlot.scheduledCourtId,
            cityId: existingSlot.scheduledClub.cityId,
            startTime: existingSlot.scheduledStartTime,
            endTime: existingSlot.scheduledEndTime,
            timeIsSet: true,
            gameCourts: [{ courtId: existingSlot.scheduledCourtId, order: 1 }],
          }
        : null;

    const game = await createLeagueGame({
      leagueRoundId,
      seasonGame,
      leagueSeasonId,
      team1PlayerIds: team1,
      team2PlayerIds: team2,
      leagueGroupId: leagueGroupId ?? undefined,
      affectsRating: resolveBracketFixtureAffectsRating(seasonGame),
      gameSetup,
      scheduleTemplate,
      db: tx,
    });

    await tx.leagueBracketSlot.update({
      where: { id: slotId },
      data: { gameId: game.id },
    });

    return game.id;
  }

  static async resolveWinnerParticipantIdFromGame(gameId: string): Promise<string | null> {
    return prisma.$transaction((tx) => this.resolveWinnerParticipantId(gameId, tx));
  }

  static async resolveWinnerParticipantId(
    gameId: string,
    tx: Prisma.TransactionClient
  ): Promise<string | null> {
    const game = await tx.game.findUnique({
      where: { id: gameId },
      include: {
        outcomes: true,
        fixedTeams: { include: { players: true } },
      },
    });
    if (!game?.fixedTeams?.length || game.resultsStatus !== ResultsStatus.FINAL) {
      return null;
    }

    const teamScores = new Map<number, { wins: number; isWinner: boolean }>();
    for (const outcome of game.outcomes) {
      const team = game.fixedTeams.find((t) =>
        t.players.some((p) => p.userId === outcome.userId)
      );
      if (!team) continue;
      const prev = teamScores.get(team.teamNumber) ?? { wins: 0, isWinner: false };
      prev.wins += outcome.wins ?? 0;
      if (outcome.isWinner) prev.isWinner = true;
      teamScores.set(team.teamNumber, prev);
    }

    // A FINAL marker alone is insufficient proof of a winner. Require an
    // outcome for every fixed team and reject contradictory/tied data instead
    // of advancing whichever team happened to be iterated first.
    if (teamScores.size !== game.fixedTeams.length) return null;

    const explicitWinners = [...teamScores.entries()]
      .filter(([, score]) => score.isWinner)
      .map(([teamNumber]) => teamNumber);
    if (explicitWinners.length > 1) return null;

    let winningTeamNumber: number | null = explicitWinners[0] ?? null;
    if (winningTeamNumber == null) {
      const bestWins = Math.max(...[...teamScores.values()].map((score) => score.wins));
      const bestTeams = [...teamScores.entries()]
        .filter(([, score]) => score.wins === bestWins)
        .map(([teamNumber]) => teamNumber);
      if (bestTeams.length !== 1) return null;
      winningTeamNumber = bestTeams[0];
    }

    const winningTeam = game.fixedTeams.find((t) => t.teamNumber === winningTeamNumber);
    if (!winningTeam || !game.parentId) return null;

    const playerIds = winningTeam.players
      .map((p) => p.userId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    const { findTeamParticipantByRoster } = await import('./leagueParticipantResolve');
    const participant = await findTeamParticipantByRoster(tx, game.parentId, playerIds);
    return participant?.id ?? null;
  }

  static async resolveLoserParticipantIdFromGame(gameId: string): Promise<string | null> {
    return prisma.$transaction((tx) => this.resolveLoserParticipantId(gameId, tx));
  }

  static async participantIdsFromGame(
    gameId: string,
    tx: Prisma.TransactionClient
  ): Promise<string[]> {
    const game = await tx.game.findUnique({
      where: { id: gameId },
      include: { fixedTeams: { include: { players: true }, orderBy: { teamNumber: 'asc' } } },
    });
    if (!game?.parentId) return [];
    const { findTeamParticipantByRoster } = await import('./leagueParticipantResolve');
    const participantIds: string[] = [];
    for (const team of game.fixedTeams) {
      const playerIds = team.players
        .map((player) => player.userId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);
      const participant = await findTeamParticipantByRoster(tx, game.parentId, playerIds);
      if (participant?.id) participantIds.push(participant.id);
    }
    return participantIds;
  }

  static async resolveChampionshipFromSlots(
    slots: Array<{
      slotKind: BracketSlotKind;
      roundIndex: number;
      gameId: string | null;
      winnerSlotId: string | null;
      feederSlotAId: string | null;
      game?: { resultsStatus: ResultsStatus | string } | null;
    }>
  ): Promise<{
    championParticipantId: string | null;
    finalistParticipantId: string | null;
    finalGameId: string | null;
  }> {
    return prisma.$transaction(async (tx) => {
      const grandFinals = slots
        .filter((slot) => slot.slotKind === BracketSlotKind.GRAND_FINAL)
        .sort((a, b) => b.roundIndex - a.roundIndex);
      const legacyGrandFinal = grandFinals.length === 1 ? grandFinals[0] : null;
      if (
        legacyGrandFinal?.gameId &&
        legacyGrandFinal.game?.resultsStatus === ResultsStatus.FINAL
      ) {
        return {
          championParticipantId: await this.resolveWinnerParticipantId(
            legacyGrandFinal.gameId,
            tx
          ),
          finalistParticipantId: await this.resolveLoserParticipantId(
            legacyGrandFinal.gameId,
            tx
          ),
          finalGameId: legacyGrandFinal.gameId,
        };
      }
      const completedReset = grandFinals.find(
        (slot) =>
          slot.roundIndex > 0 &&
          slot.gameId &&
          slot.game?.resultsStatus === ResultsStatus.FINAL
      );
      if (completedReset?.gameId) {
        return {
          championParticipantId: await this.resolveWinnerParticipantId(completedReset.gameId, tx),
          finalistParticipantId: await this.resolveLoserParticipantId(completedReset.gameId, tx),
          finalGameId: completedReset.gameId,
        };
      }

      const firstGrandFinal = grandFinals.find((slot) => slot.roundIndex === 0);
      if (
        firstGrandFinal?.gameId &&
        firstGrandFinal.game?.resultsStatus === ResultsStatus.FINAL &&
        firstGrandFinal.feederSlotAId
      ) {
        const winner = await this.resolveWinnerParticipantId(firstGrandFinal.gameId, tx);
        const winnersFeeder = await tx.leagueBracketSlot.findUnique({
          where: { id: firstGrandFinal.feederSlotAId },
          include: { game: true },
        });
        const winnersChampion = await this.participantIdFromFeeder(
          winnersFeeder,
          tx,
          BracketSlotKind.GRAND_FINAL
        );
        if (
          championshipResolvedByFirstGrandFinal({
            firstFinalWinnerId: winner,
            winnersChampionId: winnersChampion,
          })
        ) {
          return {
            championParticipantId: winner,
            finalistParticipantId: await this.resolveLoserParticipantId(
              firstGrandFinal.gameId,
              tx
            ),
            finalGameId: firstGrandFinal.gameId,
          };
        }
        return {
          championParticipantId: null,
          finalistParticipantId: null,
          finalGameId: null,
        };
      }

      if (grandFinals.length > 0) {
        return {
          championParticipantId: null,
          finalistParticipantId: null,
          finalGameId: null,
        };
      }
      const mainFinal = slots.find(
        (slot) => slot.slotKind === BracketSlotKind.MAIN && slot.winnerSlotId == null
      );
      if (!mainFinal?.gameId || mainFinal.game?.resultsStatus !== ResultsStatus.FINAL) {
        return {
          championParticipantId: null,
          finalistParticipantId: null,
          finalGameId: null,
        };
      }
      return {
        championParticipantId: await this.resolveWinnerParticipantId(mainFinal.gameId, tx),
        finalistParticipantId: await this.resolveLoserParticipantId(mainFinal.gameId, tx),
        finalGameId: mainFinal.gameId,
      };
    });
  }

  static async resolveLoserParticipantId(
    gameId: string,
    tx: Prisma.TransactionClient
  ): Promise<string | null> {
    const game = await tx.game.findUnique({
      where: { id: gameId },
      include: {
        outcomes: true,
        fixedTeams: { include: { players: true } },
      },
    });
    if (!game?.fixedTeams?.length || game.resultsStatus !== ResultsStatus.FINAL) {
      return null;
    }

    const winnerId = await this.resolveWinnerParticipantId(gameId, tx);
    if (!winnerId || !game.parentId) return null;

    const { findTeamParticipantByRoster } = await import('./leagueParticipantResolve');
    for (const team of game.fixedTeams) {
      const playerIds = team.players
        .map((p) => p.userId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);
      const participant = await findTeamParticipantByRoster(tx, game.parentId, playerIds);
      if (participant?.id && participant.id !== winnerId) {
        return participant.id;
      }
    }
    return null;
  }

  static async participantIdFromFeeder(
    feeder: {
      id: string;
      slotKind: BracketSlotKind;
      leagueParticipantId: string | null;
      gameId: string | null;
      game: { resultsStatus: ResultsStatus } | null;
    } | null,
    tx: Prisma.TransactionClient,
    targetSlotKind?: BracketSlotKind
  ): Promise<string | null> {
    if (!feeder) return null;
    if (feeder.slotKind === BracketSlotKind.BYE) {
      return feeder.leagueParticipantId;
    }
    if (feeder.gameId && feeder.game?.resultsStatus === ResultsStatus.FINAL) {
      if (targetSlotKind === BracketSlotKind.THIRD_PLACE) {
        return this.resolveLoserParticipantId(feeder.gameId, tx);
      }
      if (
        targetSlotKind === BracketSlotKind.CONSOLATION ||
        targetSlotKind === BracketSlotKind.LOSERS
      ) {
        if (feeder.slotKind === BracketSlotKind.MAIN) {
          return this.resolveLoserParticipantId(feeder.gameId, tx);
        }
        return this.resolveWinnerParticipantId(feeder.gameId, tx);
      }
      if (targetSlotKind === BracketSlotKind.GRAND_FINAL) {
        return this.resolveWinnerParticipantId(feeder.gameId, tx);
      }
      return this.resolveWinnerParticipantId(feeder.gameId, tx);
    }
    // A participant cached on a match slot is not proof that the match has
    // produced a winner. Only BYEs can feed a participant without a FINAL
    // game; otherwise downstream games could be created from an earlier-round
    // winner before this feeder match is even played.
    return null;
  }

  /** Clears downstream bracket games when a bracket game result is undone (§3.3). */
  static async onBracketGameResultsUndone(
    gameId: string,
    tx: Prisma.TransactionClient
  ): Promise<void> {
    const slot = await tx.leagueBracketSlot.findFirst({
      where: { gameId },
      include: {
        leagueRound: { select: { playoffFormat: true } },
      },
    });
    if (!slot || slot.leagueRound.playoffFormat !== PlayoffFormat.BRACKET) {
      return;
    }

    await this.lockBracketRound(slot.leagueRoundId, tx);

    const groupSlots = await tx.leagueBracketSlot.findMany({
      where: { leagueRoundId: slot.leagueRoundId, leagueGroupId: slot.leagueGroupId },
      include: { game: { select: { resultsStatus: true } } },
    });
    const byId = slotsById(groupSlots as BracketSlotRow[]);

    if (hasBlockingDownstreamMainFinal(slot.id, byId)) {
      throw new ApiError(
        409,
        'Cannot change results: a later knockout game is already final'
      );
    }

    await this.cascadeClearDescendants(slot.id, slot.leagueRoundId, slot.leagueGroupId ?? null, tx, {
      excludeSlotIds: new Set([slot.id]),
    });
    const { BracketRoundSummaryService } = await import('./bracketRoundSummary.service');
    await BracketRoundSummaryService.clearSentStateForTree(
      slot.leagueRoundId,
      slot.leagueGroupId ?? null,
      tx
    );

    if (slot.winnerSlotId) {
      await tx.leagueBracketSlot.update({
        where: { id: slot.winnerSlotId },
        data: { leagueParticipantId: null },
      });
    }
  }

  static async cascadeClearDescendants(
    startSlotId: string,
    leagueRoundId: string,
    leagueGroupId: string | null,
    tx: Prisma.TransactionClient,
    opts?: { excludeSlotIds?: Set<string> }
  ): Promise<void> {
    const groupSlots = await tx.leagueBracketSlot.findMany({
      where: { leagueRoundId, leagueGroupId },
      include: { game: { select: { id: true, resultsStatus: true } } },
    });
    const byId = slotsById(groupSlots as BracketSlotRow[]);
    const exclude = opts?.excludeSlotIds ?? new Set<string>();

    for (const descId of collectDescendantSlotIds(startSlotId, byId)) {
      if (exclude.has(descId)) continue;
      const desc = byId.get(descId);
      if (!desc) continue;
      if (desc.gameId) {
        await this.deleteBracketLinkedGame(desc.gameId, tx);
      }
      if (desc.slotKind !== BracketSlotKind.BYE && desc.leagueParticipantId) {
        await tx.leagueBracketSlot.update({
          where: { id: descId },
          data: { leagueParticipantId: null },
        });
      }
    }
  }

  static async deleteBracketLinkedGame(
    gameId: string,
    tx: Prisma.TransactionClient
  ): Promise<void> {
    await tx.leagueBracketSlot.updateMany({
      where: { gameId },
      data: { gameId: null },
    });
    await tx.game.delete({ where: { id: gameId } });
  }

  static async replaceGameTeamParticipant(
    gameId: string,
    side: 'A' | 'B',
    participantId: string,
    tx: Prisma.TransactionClient
  ): Promise<void> {
    const game = await tx.game.findUnique({
      where: { id: gameId },
      include: {
        fixedTeams: { include: { players: true }, orderBy: { teamNumber: 'asc' } },
        participants: true,
      },
    });
    if (!game) {
      throw new ApiError(404, 'Game not found');
    }
    if (game.resultsStatus === ResultsStatus.FINAL) {
      throw new ApiError(409, 'Cannot edit teams on a finalized game');
    }

    const roster = await this.rosterForParticipant(participantId, tx);
    const teamNumber = side === 'A' ? 1 : 2;
    const existing = game.fixedTeams.find((t) => t.teamNumber === teamNumber);

    const participantUserIds = new Set(game.participants.map((p) => p.userId));
    for (const userId of roster) {
      if (!participantUserIds.has(userId)) {
        await tx.gameParticipant.create({
          data: {
            gameId,
            userId,
            role: 'PARTICIPANT',
            status: 'PLAYING',
          },
        });
      }
    }

    if (existing) {
      await tx.gameTeamPlayer.deleteMany({ where: { gameTeamId: existing.id } });
      await tx.gameTeamPlayer.createMany({
        data: roster.map((userId) => ({ gameTeamId: existing.id, userId })),
      });
    } else {
      await tx.gameTeam.create({
        data: {
          gameId,
          teamNumber,
          players: { create: roster.map((userId) => ({ userId })) },
        },
      });
    }

    const refreshed = await tx.game.findUnique({
      where: { id: gameId },
      include: {
        fixedTeams: { include: { players: { select: { userId: true } } } },
        participants: { select: { id: true, userId: true, status: true, role: true } },
      },
    });
    if (refreshed) {
      const allowedUserIds = new Set(
        refreshed.fixedTeams.flatMap((team) => team.players.map((player) => player.userId))
      );
      const staleParticipantIds = stalePlayingParticipantIds(
        refreshed.participants,
        allowedUserIds
      );
      if (staleParticipantIds.length > 0) {
        await tx.gameParticipant.deleteMany({
          where: { id: { in: staleParticipantIds } },
        });
      }
    }
  }

  private static async rosterForParticipant(
    participantId: string,
    tx: Prisma.TransactionClient
  ): Promise<string[]> {
    const p = await tx.leagueParticipant.findUnique({
      where: { id: participantId },
      include: { leagueTeam: { include: { players: { select: { userId: true } } } } },
    });
    if (!p?.leagueTeam?.players?.length) {
      throw new ApiError(400, 'Invalid team participant');
    }
    return p.leagueTeam.players
      .map((pl) => pl.userId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
  }
}
