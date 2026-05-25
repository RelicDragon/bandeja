import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import {
  BracketScope,
  BracketSlotKind,
  PlayoffFormat,
  ResultsStatus,
  RoundType,
} from '@prisma/client';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import telegramNotificationService from '../telegram/notification.service';
import { generateBracketSummaryImage } from '../telegram/bracket-summary-image.service';
import { BracketAdvancementService } from './bracketAdvancement.service';
import type { BracketScopeDto } from './leagueBracketDeepLink.util';

type BracketConfigShape = {
  bracketSummarySent?: Record<string, boolean>;
};

export class BracketRoundSummaryService {
  static async notifyChampionIfNeeded(params: {
    leagueRoundId: string;
    leagueGroupId: string | null;
    leagueSeasonId?: string;
  }): Promise<void> {
    const round = await prisma.leagueRound.findUnique({
      where: { id: params.leagueRoundId },
      select: {
        id: true,
        leagueSeasonId: true,
        playoffFormat: true,
        bracketScope: true,
        bracketConfig: true,
      },
    });
    if (!round || round.playoffFormat !== PlayoffFormat.BRACKET) return;

    const summary = await this.buildGroupSummary(round.id, params.leagueGroupId);
    if (!summary?.championParticipantId) return;

    const config = (round.bracketConfig ?? {}) as BracketConfigShape;
    const sentKey = params.leagueGroupId ?? '__cross__';
    if (config.bracketSummarySent?.[sentKey]) return;

    await this.sendSummaryToParticipants({
      leagueRoundId: round.id,
      leagueSeasonId: params.leagueSeasonId ?? round.leagueSeasonId,
      leagueGroupId: params.leagueGroupId,
      bracketScope: round.bracketScope === BracketScope.CROSS_GROUP ? 'CROSS_GROUP' : 'PER_GROUP',
      summary,
    });

    const { BracketChampionStoryService } = await import('../story/bracketChampionStory.service');
    void BracketChampionStoryService.emitStoriesIfNeeded({
      leagueRoundId: round.id,
      leagueGroupId: params.leagueGroupId,
      leagueSeasonId: params.leagueSeasonId ?? round.leagueSeasonId,
    }).catch((err) => console.error('[BracketChampionStory] Failed:', err));

    const nextSent = { ...(config.bracketSummarySent ?? {}), [sentKey]: true };
    await prisma.leagueRound.update({
      where: { id: round.id },
      data: { bracketConfig: { ...config, bracketSummarySent: nextSent } },
    });
  }

  static async notifyBracketSummaryManual(
    leagueSeasonId: string,
    userId: string,
    opts?: { roundId?: string; leagueGroupId?: string }
  ): Promise<{ notifiedUsers: number }> {
    const leagueSeason = await prisma.leagueSeason.findUnique({
      where: { id: leagueSeasonId },
      include: {
        league: { select: { name: true } },
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
      throw new ApiError(403, 'Only owners and admins can send bracket summary');
    }

    const round = await prisma.leagueRound.findFirst({
      where: {
        leagueSeasonId,
        roundType: RoundType.PLAYOFF,
        playoffFormat: PlayoffFormat.BRACKET,
        ...(opts?.roundId ? { id: opts.roundId } : {}),
      },
      orderBy: { orderIndex: 'desc' },
      select: { id: true, bracketScope: true },
    });
    if (!round) {
      throw new ApiError(404, 'Bracket playoff round not found');
    }

    const leagueGroupId =
      round.bracketScope === BracketScope.CROSS_GROUP
        ? null
        : (opts?.leagueGroupId ?? null);

    const summary = await this.buildGroupSummary(round.id, leagueGroupId);
    if (!summary?.championParticipantId) {
      throw new ApiError(409, 'Bracket champion is not determined yet');
    }

    return this.sendSummaryToParticipants({
      leagueRoundId: round.id,
      leagueSeasonId,
      leagueGroupId,
      bracketScope: round.bracketScope === BracketScope.CROSS_GROUP ? 'CROSS_GROUP' : 'PER_GROUP',
      summary,
    });
  }

  private static async buildGroupSummary(
    leagueRoundId: string,
    leagueGroupId: string | null
  ): Promise<{
    championParticipantId: string | null;
    finalistParticipantId: string | null;
    thirdPlaceParticipantId: string | null;
  } | null> {
    const slots = await prisma.leagueBracketSlot.findMany({
      where: { leagueRoundId, leagueGroupId },
      include: { game: { select: { id: true, resultsStatus: true } } },
    });
    if (slots.length === 0) return null;

    const grandFinalSlot = slots.find((s) => s.slotKind === BracketSlotKind.GRAND_FINAL);
    const finalSlot =
      grandFinalSlot ??
      slots.find((s) => s.slotKind === BracketSlotKind.MAIN && s.winnerSlotId == null);
    const thirdSlot = slots.find((s) => s.slotKind === BracketSlotKind.THIRD_PLACE);

    let championParticipantId: string | null = null;
    let finalistParticipantId: string | null = null;
    let thirdPlaceParticipantId: string | null = null;

    if (finalSlot?.gameId && finalSlot.game?.resultsStatus === ResultsStatus.FINAL) {
      championParticipantId = await BracketAdvancementService.resolveWinnerParticipantIdFromGame(
        finalSlot.gameId
      );
      finalistParticipantId = await BracketAdvancementService.resolveLoserParticipantIdFromGame(
        finalSlot.gameId
      );
    }

    if (thirdSlot?.gameId && thirdSlot.game?.resultsStatus === ResultsStatus.FINAL) {
      thirdPlaceParticipantId = await BracketAdvancementService.resolveWinnerParticipantIdFromGame(
        thirdSlot.gameId
      );
    }

    return { championParticipantId, finalistParticipantId, thirdPlaceParticipantId };
  }

  private static async sendSummaryToParticipants(params: {
    leagueRoundId: string;
    leagueSeasonId: string;
    leagueGroupId: string | null;
    bracketScope: BracketScopeDto;
    summary: {
      championParticipantId: string | null;
      finalistParticipantId: string | null;
      thirdPlaceParticipantId: string | null;
    };
  }): Promise<{ notifiedUsers: number }> {
    const leagueSeason = await prisma.leagueSeason.findUnique({
      where: { id: params.leagueSeasonId },
      include: { league: { select: { name: true } } },
    });
    if (!leagueSeason) {
      throw new ApiError(404, 'League season not found');
    }

    const championLabel = await this.participantLabel(params.summary.championParticipantId);
    const finalistLabel = await this.participantLabel(params.summary.finalistParticipantId);
    const thirdPlaceLabel = params.summary.thirdPlaceParticipantId
      ? await this.participantLabel(params.summary.thirdPlaceParticipantId)
      : undefined;

    if (!championLabel || !finalistLabel) {
      throw new ApiError(409, 'Bracket champion is not determined yet');
    }

    let summaryImage: Buffer | undefined;
    try {
      summaryImage = await generateBracketSummaryImage({
        leagueName: leagueSeason.league.name,
        championLabel,
        finalistLabel,
        thirdPlaceLabel: thirdPlaceLabel ?? undefined,
      });
    } catch (err) {
      console.error('[BracketSummary] Image generation failed, sending text only:', err);
    }

    const games = await prisma.game.findMany({
      where: { leagueRoundId: params.leagueRoundId, leagueGroupId: params.leagueGroupId },
      include: {
        participants: {
          where: { status: 'PLAYING' },
          include: { user: { select: { ...USER_SELECT_FIELDS, telegramId: true, language: true } } },
        },
        fixedTeams: {
          include: {
            players: {
              include: {
                user: { select: { ...USER_SELECT_FIELDS, telegramId: true, language: true } },
              },
            },
          },
        },
      },
    });

    const usersById = new Map<string, (typeof games)[0]['participants'][0]['user']>();
    for (const game of games) {
      for (const p of game.participants) {
        if (p.user) usersById.set(p.user.id, p.user);
      }
      for (const team of game.fixedTeams) {
        for (const pl of team.players) {
          if (pl.user) usersById.set(pl.user.id, pl.user);
        }
      }
    }

    let notified = 0;
    for (const user of usersById.values()) {
      try {
        await telegramNotificationService.sendBracketRoundSummaryNotification(
          user,
          {
            leagueSeasonId: params.leagueSeasonId,
            leagueName: leagueSeason.league.name,
            bracketScope: params.bracketScope,
            leagueGroupId: params.leagueGroupId,
            championLabel,
            finalistLabel,
            thirdPlaceLabel: thirdPlaceLabel ?? undefined,
          },
          summaryImage
        );
        notified++;
      } catch (err) {
        console.error(`[BracketSummary] Failed for user ${user.id}:`, err);
      }
    }

    return { notifiedUsers: notified };
  }

  private static async participantLabel(participantId: string | null): Promise<string | null> {
    if (!participantId) return null;
    const p = await prisma.leagueParticipant.findUnique({
      where: { id: participantId },
      include: {
        leagueTeam: {
          include: {
            players: {
              include: { user: { select: { firstName: true, lastName: true } } },
            },
          },
        },
      },
    });
    const names =
      p?.leagueTeam?.players
        .map((pl) => [pl.user.firstName, pl.user.lastName].filter(Boolean).join(' '))
        .filter((n) => n.length > 0) ?? [];
    return names.length > 0 ? names.join(' / ') : 'Team';
  }
}
