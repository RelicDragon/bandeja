import { BracketScope, BracketSlotKind, PlayoffFormat, ResultsStatus, StorySourceType } from '@prisma/client';
import prisma from '../../config/database';
import { BracketAdvancementService } from '../league/bracketAdvancement.service';
import type { BracketScopeDto } from '../league/leagueBracketDeepLink.util';
import { canSeeBracketChampionInStories } from './story.permissions';
import type { GamePhotosViewer } from '../../shared/gamePhotos/permissions';
import { emitStoryNew } from './story.events';
import {
  segmentKey,
  storyGameBackdropUrl,
  toGameSummary,
  type GameStorySummary,
  type StorySegment,
} from './story.feed.service';

const SEASON_GAME_SELECT = {
  id: true,
  name: true,
  entityType: true,
  sport: true,
  gameType: true,
  startTime: true,
  endTime: true,
  status: true,
  isPublic: true,
  cityId: true,
  clubId: true,
  avatar: true,
  maxParticipants: true,
  resultsStatus: true,
  forbidOthersPhotosView: true,
  mainPhotoId: true,
  city: { select: { name: true } },
  club: { select: { name: true } },
  court: { select: { club: { select: { name: true } } } },
  _count: {
    select: {
      participants: { where: { status: 'PLAYING' } },
    },
  },
  mainPhoto: {
    select: { id: true, thumbnailUrl: true, originalUrl: true },
  },
  participants: { select: { userId: true, role: true } },
  parent: {
    select: {
      participants: { select: { userId: true, role: true } },
    },
  },
} as const;

export type BracketChampionStoryBracket = {
  leagueSeasonId: string;
  leagueRoundId: string;
  leagueGroupId: string | null;
  bracketScope: BracketScopeDto;
};

export type BracketChampionStoryPayload = {
  leagueName: string;
  championTeamLabel: string;
  bracket: BracketChampionStoryBracket;
  game: GameStorySummary;
};

export function bracketChampionSourceId(leagueRoundId: string, leagueGroupId: string | null): string {
  return `${leagueRoundId}:${leagueGroupId ?? 'cross'}`;
}

export function parseBracketChampionSourceId(sourceId: string): {
  leagueRoundId: string;
  leagueGroupId: string | null;
} {
  const idx = sourceId.indexOf(':');
  if (idx <= 0) {
    return { leagueRoundId: sourceId, leagueGroupId: null };
  }
  const leagueRoundId = sourceId.slice(0, idx);
  const groupKey = sourceId.slice(idx + 1);
  return {
    leagueRoundId,
    leagueGroupId: groupKey === 'cross' ? null : groupKey,
  };
}

export async function resolveChampionTeamLabel(participantId: string): Promise<string> {
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

async function rosterUserIds(participantId: string): Promise<string[]> {
  const p = await prisma.leagueParticipant.findUnique({
    where: { id: participantId },
    include: { leagueTeam: { include: { players: { select: { userId: true } } } } },
  });
  return (
    p?.leagueTeam?.players
      .map((pl) => pl.userId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0) ?? []
  );
}

function buildBracketChampionSegment(params: {
  sourceId: string;
  createdAt: Date;
  viewed: boolean;
  leagueName: string;
  championTeamLabel: string;
  bracket: BracketChampionStoryBracket;
  game: GameStorySummary;
}): StorySegment {
  return {
    key: segmentKey(StorySourceType.BRACKET_CHAMPION, params.sourceId),
    sourceType: 'BRACKET_CHAMPION',
    viewed: params.viewed,
    createdAt: params.createdAt.toISOString(),
    leagueName: params.leagueName,
    championTeamLabel: params.championTeamLabel,
    bracket: params.bracket,
    game: params.game,
  };
}

export type BracketChampionRawSegment = {
  ownerUserId: string;
  sourceType: StorySourceType;
  sourceId: string;
  createdAt: Date;
  previewThumbnailUrl: string | null;
  segment: StorySegment;
};

export class BracketChampionStoryService {
  static async emitStoriesIfNeeded(params: {
    leagueRoundId: string;
    leagueGroupId: string | null;
    leagueSeasonId: string;
  }): Promise<void> {
    const round = await prisma.leagueRound.findUnique({
      where: { id: params.leagueRoundId },
      select: {
        id: true,
        playoffFormat: true,
        bracketScope: true,
        bracketConfig: true,
        leagueSeason: {
          include: {
            league: { select: { name: true } },
            game: { select: SEASON_GAME_SELECT },
          },
        },
      },
    });
    if (!round || round.playoffFormat !== PlayoffFormat.BRACKET) return;
    const seasonGame = round.leagueSeason?.game;
    if (!seasonGame?.isPublic) return;

    const finalSlot = await prisma.leagueBracketSlot.findFirst({
      where: {
        leagueRoundId: params.leagueRoundId,
        leagueGroupId: params.leagueGroupId,
        OR: [
          {
            slotKind: BracketSlotKind.GRAND_FINAL,
            game: { resultsStatus: ResultsStatus.FINAL },
          },
          {
            slotKind: BracketSlotKind.MAIN,
            winnerSlotId: null,
            game: { resultsStatus: ResultsStatus.FINAL },
          },
        ],
      },
      include: { game: { select: { finishedDate: true } } },
    });
    if (!finalSlot?.gameId) return;

    const championParticipantId = await BracketAdvancementService.resolveWinnerParticipantIdFromGame(
      finalSlot.gameId
    );
    if (!championParticipantId) return;

    const sourceId = bracketChampionSourceId(params.leagueRoundId, params.leagueGroupId);
    const championTeamLabel = await resolveChampionTeamLabel(championParticipantId);
    const rosterIds = await rosterUserIds(championParticipantId);
    const createdAt = finalSlot.game?.finishedDate ?? new Date();
    const bracketScope: BracketScopeDto =
      round.bracketScope === BracketScope.CROSS_GROUP ? 'CROSS_GROUP' : 'PER_GROUP';
    const bracket: BracketChampionStoryBracket = {
      leagueSeasonId: params.leagueSeasonId,
      leagueRoundId: params.leagueRoundId,
      leagueGroupId: params.leagueGroupId,
      bracketScope,
    };
    const leagueName = round.leagueSeason.league.name;

    const owners = await prisma.user.findMany({
      where: { id: { in: rosterIds } },
      select: { id: true, shareGameResultsToFollowers: true },
    });
    const seasonParticipants = await prisma.gameParticipant.findMany({
      where: { gameId: seasonGame.id, userId: { in: rosterIds } },
      select: { userId: true, showInStories: true },
    });
    const showInStoriesByUser = new Map(
      seasonParticipants.map((row) => [row.userId, row.showInStories])
    );

    for (const owner of owners) {
      if (
        !canSeeBracketChampionInStories({
          viewerFollows: true,
          game: seasonGame,
          owner,
          participant: { showInStories: showInStoriesByUser.get(owner.id) ?? true },
        })
      ) {
        continue;
      }
      const game = toGameSummary(seasonGame, { id: owner.id, isAdmin: false });
      const segment = buildBracketChampionSegment({
        sourceId,
        createdAt,
        viewed: false,
        leagueName,
        championTeamLabel,
        bracket,
        game,
      });
      await emitStoryNew(owner.id, segment);
    }
  }

  static async loadRawSegments(params: {
    activityOwnerIds: string[];
    followedIds: Set<string>;
    activitySince: Date;
    viewedSet: Set<string>;
    viewer: GamePhotosViewer;
  }): Promise<BracketChampionRawSegment[]> {
    if (params.activityOwnerIds.length === 0) return [];

    const finalSlots = await prisma.leagueBracketSlot.findMany({
      where: {
        OR: [
          {
            slotKind: BracketSlotKind.GRAND_FINAL,
            game: {
              resultsStatus: ResultsStatus.FINAL,
              finishedDate: { gte: params.activitySince },
            },
          },
          {
            slotKind: BracketSlotKind.MAIN,
            winnerSlotId: null,
            game: {
              resultsStatus: ResultsStatus.FINAL,
              finishedDate: { gte: params.activitySince },
            },
          },
        ],
        leagueRound: { playoffFormat: PlayoffFormat.BRACKET },
      },
      include: {
        game: { select: { finishedDate: true } },
        leagueRound: {
          select: {
            id: true,
            bracketScope: true,
            leagueSeason: {
              include: {
                league: { select: { name: true } },
                game: { select: SEASON_GAME_SELECT },
              },
            },
          },
        },
      },
      take: 100,
    });

    const raw: BracketChampionRawSegment[] = [];

    for (const slot of finalSlots) {
      const seasonGame = slot.leagueRound.leagueSeason?.game;
      if (!seasonGame?.isPublic || !slot.gameId) continue;

      const championParticipantId = await BracketAdvancementService.resolveWinnerParticipantIdFromGame(
        slot.gameId
      );
      if (!championParticipantId) continue;

      const rosterIds = await rosterUserIds(championParticipantId);
      const owners = await prisma.user.findMany({
        where: {
          id: { in: rosterIds.filter((id) => params.activityOwnerIds.includes(id)) },
        },
        select: { id: true, shareGameResultsToFollowers: true },
      });
      const seasonParticipants = await prisma.gameParticipant.findMany({
        where: {
          gameId: seasonGame.id,
          userId: { in: owners.map((o) => o.id) },
        },
        select: { userId: true, showInStories: true },
      });
      const showInStoriesByUser = new Map(
        seasonParticipants.map((row) => [row.userId, row.showInStories])
      );

      const sourceId = bracketChampionSourceId(slot.leagueRoundId, slot.leagueGroupId);
      const championLabel = await resolveChampionTeamLabel(championParticipantId);
      const createdAt = slot.game?.finishedDate ?? new Date();
      const preview = storyGameBackdropUrl(seasonGame, params.viewer);
      const bracketScope: BracketScopeDto =
        slot.leagueRound.bracketScope === BracketScope.CROSS_GROUP ? 'CROSS_GROUP' : 'PER_GROUP';
      const bracket: BracketChampionStoryBracket = {
        leagueSeasonId: slot.leagueRound.leagueSeason.id,
        leagueRoundId: slot.leagueRoundId,
        leagueGroupId: slot.leagueGroupId,
        bracketScope,
      };
      const game = toGameSummary(seasonGame, params.viewer);
      const leagueName = slot.leagueRound.leagueSeason.league.name;

      for (const owner of owners) {
        if (!params.followedIds.has(owner.id)) continue;
        if (
          !canSeeBracketChampionInStories({
            viewerFollows: true,
            game: seasonGame,
            owner,
            participant: { showInStories: showInStoriesByUser.get(owner.id) ?? true },
          })
        ) {
          continue;
        }
        const seg = buildBracketChampionSegment({
          sourceId,
          createdAt,
          viewed: params.viewedSet.has(segmentKey(StorySourceType.BRACKET_CHAMPION, sourceId)),
          leagueName,
          championTeamLabel: championLabel,
          bracket,
          game,
        });
        raw.push({
          ownerUserId: owner.id,
          sourceType: StorySourceType.BRACKET_CHAMPION,
          sourceId,
          createdAt,
          previewThumbnailUrl: preview,
          segment: seg,
        });
      }
    }

    return raw;
  }
}
