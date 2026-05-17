import { EntityType, Prisma, ResultsStatus, RoundType } from '@prisma/client';
import { LeagueGameResultsService } from './gameResults.service';

export interface LeagueStandingsRecalculateResult {
  participantsReset: number;
  gamesSynced: number;
  finalGamesSynced: number;
  inProgressGamesSynced: number;
}

export class LeagueStandingsRecalculateService {
  /** Zero season standings, then rebuild from REGULAR league games with outcomes (FINAL + IN_PROGRESS). */
  static async recalculateFromPlayedGames(
    leagueSeasonId: string,
    tx: Prisma.TransactionClient
  ): Promise<LeagueStandingsRecalculateResult> {
    const reset = await tx.leagueParticipant.updateMany({
      where: { leagueSeasonId },
      data: {
        points: 0,
        wins: 0,
        ties: 0,
        losses: 0,
        scoreDelta: 0,
      },
    });

    const baseWhere = {
      entityType: EntityType.LEAGUE,
      parentId: leagueSeasonId,
      leagueRoundId: { not: null },
      leagueGroupId: { not: null },
      outcomes: { some: {} },
      leagueRound: {
        leagueSeasonId,
        roundType: RoundType.REGULAR,
      },
    } as const;

    const finalGames = await tx.game.findMany({
      where: {
        ...baseWhere,
        resultsStatus: ResultsStatus.FINAL,
      },
      select: { id: true },
      orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
    });

    const inProgressGames = await tx.game.findMany({
      where: {
        ...baseWhere,
        resultsStatus: ResultsStatus.IN_PROGRESS,
      },
      select: { id: true },
      orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
    });

    const ordered = [
      ...finalGames.map((g) => ({ id: g.id, status: ResultsStatus.FINAL })),
      ...inProgressGames.map((g) => ({ id: g.id, status: ResultsStatus.IN_PROGRESS })),
    ];

    for (const game of ordered) {
      await LeagueGameResultsService.syncGameResults(game.id, tx);
    }

    return {
      participantsReset: reset.count,
      gamesSynced: ordered.length,
      finalGamesSynced: finalGames.length,
      inProgressGamesSynced: inProgressGames.length,
    };
  }
}
